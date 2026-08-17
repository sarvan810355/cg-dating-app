// Reusable Avatar — see docs/DESIGN_SYSTEM.md Reusable Component Library.
// Circular photo with initials fallback and an optional verification-badge slot.
const SIZE_CLASSES = {
  sm: 'h-9 w-9 text-xs',
  md: 'h-14 w-14 text-base',
  lg: 'h-24 w-24 text-2xl',
  xl: 'h-32 w-32 text-3xl',
};

function initialsFrom(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase()).join('') || '?';
}

function Avatar({ src, name, size = 'md', verified = false, className = '' }) {
  const sizeClass = SIZE_CLASSES[size] || SIZE_CLASSES.md;

  return (
    <span className={`relative inline-flex shrink-0 ${className}`}>
      {src ? (
        <img
          src={src}
          alt={name || 'Profile photo'}
          className={`${sizeClass} rounded-full object-cover ring-2 ring-surface`}
        />
      ) : (
        <span
          className={`${sizeClass} flex items-center justify-center rounded-full bg-primary-subtle font-semibold text-primary ring-2 ring-surface`}
        >
          {initialsFrom(name)}
        </span>
      )}
      {verified && (
        <span
          title="Verified"
          className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-success text-[10px] font-bold text-white ring-2 ring-surface"
        >
          ✓
        </span>
      )}
    </span>
  );
}

export default Avatar;
