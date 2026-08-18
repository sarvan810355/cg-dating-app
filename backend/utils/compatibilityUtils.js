// "Why You Match" — deterministic, heuristic profile-comparison scoring.
//
// NOT a real AI/LLM call: this project has no ANTHROPIC_API_KEY configured
// anywhere (see backend/.env.example — only PORT/MONGODB_URI/JWT_SECRET
// exist), so there is nothing to call. Every "AI-sounding" feature in this
// codebase has to be mocked/heuristic-based given that, and this one is no
// exception — see MOCK_FEATURES.md for the full explanation and what a real
// Claude API integration would need to look like (docs/ARCHITECTURE.md's AI
// layer section).
//
// Deliberately pure / DB-independent (same "standalone-Node-script
// testable, no live MongoDB needed" pattern already used elsewhere in this
// codebase — see backend/utils/matchUtils.js's top comment) — takes two
// already-loaded Profile documents (or plain objects with the same shape,
// e.g. from a Mongoose .toObject() or a hand-built fake in a test script)
// and returns { score, reasons }. Never claims scientific/psychological
// accuracy — reasons read like plain-language observations a friend might
// make ("You both love Travel", "Same relationship goal: Serious dating"),
// never clinical/algorithmic-sounding output.

// Weighting philosophy (documented here since neither docs/BUSINESS_PLAN.md
// nor docs/DATABASE_SCHEMA.md sketch a concrete "CG Match Score" formula to
// reuse — these weights are defined fresh for this feature):
//   - Same dating intention matters most: two people wanting different
//     things (e.g. casual vs. marriage) is the single biggest real-world
//     mismatch a dating app can flag, so it gets the largest weight.
//   - Same city is a strong practical signal for a local-first,
//     Chhattisgarh-first app (docs/BUSINESS_PLAN.md) — a "local" match is
//     part of the core positioning, not just a nice-to-have.
//   - Shared interests and shared personality-prompt themes are genuine
//     conversation fodder, weighted per-item but capped so one profile with
//     an unusually long interest list can't dominate the score by volume
//     alone.
//   - Shared language and matching lifestyle answers (smoking/drinking/diet)
//     are smaller, supporting signals — nice to know, not decisive.
// Max theoretical raw total (all categories fully matching) is 105,
// deliberately over 100 so a genuinely excellent match still reads as a
// clean 100 after clamping, rather than needing every single category to
// line up perfectly to reach the top of the scale.
const WEIGHTS = {
  datingIntention: 25,
  city: 15,
  interestPerShared: 8,
  maxSharedInterests: 3, // caps the interest contribution at 24
  sharedLanguage: 10, // flat bonus for >=1 shared language, not per-language
  lifestylePerField: 5, // smoking / drinking / diet, each matching non-null value
  promptPerShared: 8,
  maxSharedPrompts: 2, // caps the personality-prompt contribution at 16
};

const MAX_REASONS = 5;

function normalize(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

// Case-/whitespace-insensitive intersection that still returns the
// *original* casing from `listA` for display (e.g. "Cricket", not
// "cricket") — reasons should read naturally, not force-lowercased.
function sharedValues(listA, listB) {
  if (!Array.isArray(listA) || !Array.isArray(listB)) return [];
  const bSet = new Set(listB.map(normalize));
  const seen = new Set();
  const shared = [];
  for (const raw of listA) {
    const key = normalize(raw);
    if (key && bSet.has(key) && !seen.has(key)) {
      seen.add(key);
      shared.push(raw);
    }
  }
  return shared;
}

// "serious_dating" -> "Serious dating" (enum values are snake_case; reasons
// should read as plain English, not raw enum values).
function intentionLabel(value) {
  if (!value) return '';
  const words = value.split('_');
  return words
    .map((w, i) => (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ');
}

function joinNaturally(items) {
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

// Computes { score: 0-100, reasons: string[] (0-5 short strings) } for two
// Profile documents/objects. Either can be null/undefined (e.g. a profile
// somehow missing mid-flow) — returns a neutral zero-score, no-reasons
// result rather than throwing, since this is always an enrichment on top of
// an already-real match, never a hard requirement to view one.
function computeCompatibility(profileA, profileB) {
  if (!profileA || !profileB) {
    return { score: 0, reasons: [] };
  }

  // Each candidate is only ever pushed when the underlying data genuinely
  // overlaps — reasons are never fabricated just to pad the list out to a
  // target count. Sorted by weight afterward so the most meaningful overlaps
  // surface first if there are more than MAX_REASONS of them.
  const candidates = [];
  let score = 0;

  if (
    profileA.datingIntention &&
    profileB.datingIntention &&
    profileA.datingIntention === profileB.datingIntention
  ) {
    score += WEIGHTS.datingIntention;
    candidates.push({
      weight: WEIGHTS.datingIntention,
      text: `Same relationship goal: ${intentionLabel(profileA.datingIntention)}`,
    });
  }

  if (profileA.city && profileB.city && normalize(profileA.city) === normalize(profileB.city)) {
    score += WEIGHTS.city;
    candidates.push({ weight: WEIGHTS.city, text: `Both in ${profileA.city}` });
  }

  const sharedInterests = sharedValues(profileA.interests, profileB.interests).slice(
    0,
    WEIGHTS.maxSharedInterests
  );
  if (sharedInterests.length > 0) {
    const interestScore = sharedInterests.length * WEIGHTS.interestPerShared;
    score += interestScore;
    candidates.push({
      weight: interestScore,
      text: `You both love ${joinNaturally(sharedInterests)}`,
    });
  }

  const sharedLanguages = sharedValues(profileA.languages, profileB.languages);
  if (sharedLanguages.length > 0) {
    score += WEIGHTS.sharedLanguage;
    candidates.push({
      weight: WEIGHTS.sharedLanguage,
      text: `You both speak ${joinNaturally(sharedLanguages.slice(0, 2))}`,
    });
  }

  const LIFESTYLE_LABELS = {
    smoking: 'smoking habits',
    drinking: 'drinking habits',
    diet: 'diet',
  };
  let lifestyleScore = 0;
  const lifestyleMatches = [];
  ['smoking', 'drinking', 'diet'].forEach((field) => {
    const a = profileA.lifestyle && profileA.lifestyle[field];
    const b = profileB.lifestyle && profileB.lifestyle[field];
    if (a && b && a === b) {
      lifestyleScore += WEIGHTS.lifestylePerField;
      lifestyleMatches.push(LIFESTYLE_LABELS[field]);
    }
  });
  if (lifestyleMatches.length > 0) {
    score += lifestyleScore;
    candidates.push({
      weight: lifestyleScore,
      text: `Similar ${joinNaturally(lifestyleMatches)}`,
    });
  }

  const promptsA = Array.isArray(profileA.personalityPrompts) ? profileA.personalityPrompts : [];
  const promptsB = Array.isArray(profileB.personalityPrompts) ? profileB.personalityPrompts : [];
  const promptsBTexts = new Set(promptsB.map((p) => normalize(p && p.prompt)));
  const sharedPrompts = promptsA
    .filter((p) => p && promptsBTexts.has(normalize(p.prompt)))
    .slice(0, WEIGHTS.maxSharedPrompts);
  if (sharedPrompts.length > 0) {
    const promptScore = sharedPrompts.length * WEIGHTS.promptPerShared;
    score += promptScore;
    candidates.push({
      weight: promptScore,
      text:
        sharedPrompts.length === 1
          ? `You both answered "${sharedPrompts[0].prompt}"`
          : `You both answered ${sharedPrompts.length} of the same prompts`,
    });
  }

  candidates.sort((a, b) => b.weight - a.weight);
  const reasons = candidates.slice(0, MAX_REASONS).map((c) => c.text);

  return { score: Math.min(100, Math.round(score)), reasons };
}

module.exports = { computeCompatibility, WEIGHTS };
