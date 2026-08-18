// Date Planner (Task #18 — V2, see docs/ROADMAP.md's Phase 12). A small, curated,
// static suggestion generator — explicitly **not** real AI: there is no Claude API
// key configured for this project (same constraint already documented for Task #15's
// Icebreakers/Why-You-Match, see MOCK_FEATURES.md). This is plain heuristic filtering
// over an in-code list, kept pure/DB-independent so it's unit-testable via a
// standalone Node script.
//
// **Safety rule (explicit product-spec requirement, not a style choice): every
// suggestion here must be a PUBLIC place/activity.** The product spec's own wording
// is "never encourage first meetings in isolated/private locations" — nothing in this
// list is a private residence, an isolated outdoor spot, or anything not staffed/
// visible to the general public. See docs/BUSINESS_PLAN.md / the Safe Date feature
// this pairs with (backend/utils/safeDateUtils.js) for the same underlying safety
// philosophy.

const { DATE_IDEA_BUDGETS, DATE_IDEA_ACTIVITY_TYPES } = require('../constants/dateIdeaOptions');

// Curated with Chhattisgarh in mind (per the product spec — this app is CG-first, see
// docs/DESIGN_SYSTEM.md's "Local (Chhattisgarh-first)" direction) but written
// generically enough to make sense in any CG city/town, not just Raipur/Bhilai/Durg/
// Bilaspur — `city`, when provided, is only used to personalize the wording, never to
// look up a real venue (there's no places/maps API integrated in this project).
const DATE_IDEAS = [
  {
    id: 'coffee-evening-walk',
    title: 'Coffee + evening walk',
    description: 'Grab a coffee at a well-known local café, then take an easy walk together somewhere public and well-lit — a market road or a park with other people around.',
    budgets: ['low', 'medium'],
    activityTypes: ['coffee', 'walk'],
  },
  {
    id: 'local-food-photography',
    title: 'Local food + a photography spot',
    description: 'Try a popular local eatery for Chhattisgarhi thali or street food, then walk over to a well-known public photo spot nearby — a garden, a lake-front, or a heritage building.',
    budgets: ['low', 'medium'],
    activityTypes: ['food', 'outdoor'],
  },
  {
    id: 'public-park-visit',
    title: 'Public park visit',
    description: 'Meet at a busy public park or garden during daylight hours — plenty of families and other visitors around, easy to talk, easy to leave whenever either of you wants.',
    budgets: ['low'],
    activityTypes: ['outdoor', 'walk'],
  },
  {
    id: 'multiplex-movie',
    title: 'Movie at a popular multiplex',
    description: 'Catch a show at a well-known multiplex, then grab ice cream or a snack somewhere nearby with other people around — a simple, low-pressure first-meeting format.',
    budgets: ['medium', 'high'],
    activityTypes: ['movie'],
  },
  {
    id: 'lakefront-boating',
    title: 'Boating at a public lake',
    description: 'A well-known public lake with a staffed boating area — a bit of fun activity to ease conversation, always around other visitors.',
    budgets: ['medium', 'high'],
    activityTypes: ['outdoor'],
  },
  {
    id: 'museum-or-science-centre',
    title: 'Museum or science centre visit',
    description: 'A public museum, science centre, or art gallery — quiet, well-supervised, and gives you plenty to talk about without any awkward silences.',
    budgets: ['low', 'medium'],
    activityTypes: ['outdoor', 'other'],
  },
  {
    id: 'street-market-walk',
    title: 'Evening walk + street food at a busy market',
    description: 'Wander a well-known, busy market area in the evening — easy to browse stalls, grab a quick bite, and there are always other people around.',
    budgets: ['low'],
    activityTypes: ['walk', 'food'],
  },
  {
    id: 'high-tea-cafe',
    title: 'High tea at a well-reviewed café',
    description: 'A relaxed sit-down high tea or dessert spot at a popular, well-reviewed café — a comfortable, upscale option for a longer conversation.',
    budgets: ['high'],
    activityTypes: ['coffee', 'food'],
  },
  {
    id: 'fine-dining',
    title: 'Fine dining at a popular restaurant',
    description: 'A well-known, well-reviewed restaurant — a good option once you already feel comfortable and want a proper sit-down meal in a public, staffed setting.',
    budgets: ['high'],
    activityTypes: ['food'],
  },
  {
    id: 'botanical-garden-zoo',
    title: 'Botanical garden or zoo visit',
    description: 'A public botanical garden or zoo — a relaxed daytime outing with plenty of other visitors and easy, low-pressure conversation topics along the way.',
    budgets: ['low', 'medium'],
    activityTypes: ['outdoor'],
  },
];

const MIN_SUGGESTIONS = 2;
const MAX_SUGGESTIONS = 4;
const DEFAULT_SUGGESTION_IDS = [
  'coffee-evening-walk',
  'local-food-photography',
  'public-park-visit',
  'street-market-walk',
];

function personalize(idea, city) {
  if (!city) return { id: idea.id, title: idea.title, description: idea.description };
  return {
    id: idea.id,
    title: idea.title,
    description: `${idea.description} (in ${city})`,
  };
}

// Pure. `budget`/`activityType` are optional and, when provided, must already be one
// of DATE_IDEA_BUDGETS / DATE_IDEA_ACTIVITY_TYPES (validated by the route before this
// is called — see backend/routes/dateIdeas.js). `city` is optional free text, used
// only to personalize the returned description text.
//
// Always returns between MIN_SUGGESTIONS and MAX_SUGGESTIONS ideas: an exact
// budget+activityType match is preferred, but if that's too narrow (fewer than
// MIN_SUGGESTIONS results) the filter is progressively relaxed — budget-only, then
// activityType-only, then a small curated default set — rather than ever returning
// an unhelpfully short (or empty) list.
function getDateIdeaSuggestions({ budget, activityType, city } = {}) {
  const matchesBudget = (idea) => !budget || idea.budgets.includes(budget);
  const matchesActivity = (idea) => !activityType || idea.activityTypes.includes(activityType);

  let picked = DATE_IDEAS.filter((idea) => matchesBudget(idea) && matchesActivity(idea));

  if (picked.length < MIN_SUGGESTIONS && budget) {
    const budgetOnly = DATE_IDEAS.filter(matchesBudget);
    picked = [...picked, ...budgetOnly.filter((i) => !picked.includes(i))];
  }
  if (picked.length < MIN_SUGGESTIONS && activityType) {
    const activityOnly = DATE_IDEAS.filter(matchesActivity);
    picked = [...picked, ...activityOnly.filter((i) => !picked.includes(i))];
  }
  if (picked.length < MIN_SUGGESTIONS) {
    const defaults = DATE_IDEAS.filter((idea) => DEFAULT_SUGGESTION_IDS.includes(idea.id));
    picked = [...picked, ...defaults.filter((i) => !picked.includes(i))];
  }

  return picked.slice(0, MAX_SUGGESTIONS).map((idea) => ({
    ...personalize(idea, city),
    budgets: idea.budgets,
    activityTypes: idea.activityTypes,
  }));
}

module.exports = {
  DATE_IDEAS,
  getDateIdeaSuggestions,
  MIN_SUGGESTIONS,
  MAX_SUGGESTIONS,
};

// Re-exported here purely so callers of this module don't need a second require for
// the enums that gate its own params — backend/routes/dateIdeas.js still imports them
// directly from backend/constants/dateIdeaOptions.js for validation, this is just a
// convenience alias.
module.exports.DATE_IDEA_BUDGETS = DATE_IDEA_BUDGETS;
module.exports.DATE_IDEA_ACTIVITY_TYPES = DATE_IDEA_ACTIVITY_TYPES;
