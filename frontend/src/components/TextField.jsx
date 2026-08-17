// Reusable TextField — see docs/DESIGN_SYSTEM.md Reusable Component Library.
// Covers input/textarea/select via `as`, so the profile builder doesn't need
// a separate Select component for its handful of dropdowns.
function TextField({
  as = 'input',
  label,
  id,
  error,
  helperText,
  options = [],
  placeholder,
  className = '',
  containerClassName = '',
  ...rest
}) {
  const fieldClasses = `w-full rounded-lg border bg-surface px-3 py-2.5 text-sm text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-2 focus:ring-primary/40 ${
    error ? 'border-error' : 'border-border'
  } ${className}`;

  return (
    <div className={containerClassName}>
      {label && (
        <label htmlFor={id} className="mb-1 block text-sm font-medium text-text-primary">
          {label}
        </label>
      )}

      {as === 'textarea' && (
        <textarea id={id} placeholder={placeholder} className={fieldClasses} {...rest} />
      )}

      {as === 'select' && (
        <select id={id} className={fieldClasses} {...rest}>
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      )}

      {as === 'input' && (
        <input id={id} placeholder={placeholder} className={fieldClasses} {...rest} />
      )}

      {error ? (
        <p className="mt-1 text-xs text-error">{error}</p>
      ) : helperText ? (
        <p className="mt-1 text-xs text-text-secondary">{helperText}</p>
      ) : null}
    </div>
  );
}

export default TextField;
