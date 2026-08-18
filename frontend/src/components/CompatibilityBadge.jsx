// Reusable CompatibilityBadge — see docs/DESIGN_SYSTEM.md's Reusable
// Component Library ("shows match/compatibility signal (esp. once AI 'Why
// You Match' ships in V2)"). Task #15 (Smart Icebreakers + Why-You-Match,
// V2, user-requested).
//
// Deliberately dumb/presentational, same pattern as VerificationBadge —
// callers decide whether/when to render it and pass the already-computed
// score. The `title` tooltip is the one place this makes the heuristic
// nature explicit to a curious user, since the score itself is just a
// number with a % sign otherwise.
function CompatibilityBadge({ score, size = 'sm', className = '' }) {
  if (score === null || score === undefined) return null;
  const sizeClass = size === 'sm' ? 'text-[10px] px-2 py-0.5 gap-0.5' : 'text-xs px-2.5 py-1 gap-1';

  return (
    <span
      title="Why You Match — based on shared profile details (interests, goals, location), not a certified compatibility test"
      className={`inline-flex items-center rounded-full bg-primary-subtle font-semibold text-primary ${sizeClass} ${className}`}
    >
      <span aria-hidden="true">✨</span>
      {score}% Match
    </span>
  );
}

export default CompatibilityBadge;
