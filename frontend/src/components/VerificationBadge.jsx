// Reusable VerificationBadge — see docs/DESIGN_SYSTEM.md's Reusable
// Component Library ("small trust indicator shown on verified
// profiles/photos"). Task #9 (Verification, = docs/ROADMAP.md's Phase 7).
//
// Deliberately dumb/presentational: callers decide *whether* to render it
// (e.g. `profile.mobileVerified && <VerificationBadge type="mobile" />`) —
// it never fetches anything itself.
const LABELS = {
  mobile: 'Mobile Verified',
  photo: 'Photo Verified',
};

const ICONS = {
  mobile: '✓',
  photo: '📷',
};

function VerificationBadge({ type = 'mobile', size = 'sm', className = '' }) {
  const label = LABELS[type] || LABELS.mobile;
  const icon = ICONS[type] || ICONS.mobile;
  const sizeClass = size === 'sm' ? 'text-[10px] px-2 py-0.5 gap-0.5' : 'text-xs px-2.5 py-1 gap-1';

  return (
    <span
      title={label}
      className={`inline-flex items-center rounded-full bg-success-subtle font-semibold text-success ${sizeClass} ${className}`}
    >
      <span aria-hidden="true">{icon}</span>
      {label}
    </span>
  );
}

export default VerificationBadge;
