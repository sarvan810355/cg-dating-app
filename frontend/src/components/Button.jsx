// Reusable Button — see docs/DESIGN_SYSTEM.md Reusable Component Library.
// Variants: primary/secondary/ghost/destructive, with a loading state.
const VARIANT_CLASSES = {
  primary: 'bg-primary text-white hover:bg-primary-hover disabled:opacity-60',
  secondary:
    'bg-surface text-text-primary border border-border hover:bg-primary-subtle disabled:opacity-60',
  ghost: 'bg-transparent text-primary hover:bg-primary-subtle disabled:opacity-60',
  destructive: 'bg-error text-white hover:opacity-90 disabled:opacity-60',
};

function Button({
  variant = 'primary',
  loading = false,
  disabled = false,
  type = 'button',
  icon = null,
  className = '',
  children,
  ...rest
}) {
  const variantClass = VARIANT_CLASSES[variant] || VARIANT_CLASSES.primary;

  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-primary/40 ${variantClass} ${className}`}
      {...rest}
    >
      {loading ? (
        <span
          className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden="true"
        />
      ) : (
        icon
      )}
      {children}
    </button>
  );
}

export default Button;
