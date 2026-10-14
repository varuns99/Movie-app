type Option = { value: string; label: string };

type Props = {
  label: string;
  options: Option[];
  selected: string[];
  onChange: (selected: string[]) => void;
  disabled?: boolean;
  // Most options that can be picked at once; the rest lock until one is removed.
  max?: number;
};

// Pick any number of options by tapping chips. Nothing selected means "any".
export function ChipSelect({ label, options, selected, onChange, disabled, max }: Props) {
  const full = max !== undefined && selected.length >= max;
  const toggle = (value: string) =>
    onChange(selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value]);

  return (
    <div className="filter-group" role="group" aria-label={label}>
      <div className="filter-group-heading">
        <span>{label}</span>
        <span className="filter-group-hint">
          {selected.length ? `${selected.length}${max ? ` of ${max}` : ""} selected` : max ? `Any (pick up to ${max})` : "Any"}
        </span>
        {selected.length > 0 && (
          <button type="button" className="link-button" disabled={disabled} onClick={() => onChange([])}>
            Clear
          </button>
        )}
      </div>
      <div className="chip-toggles">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className={selected.includes(option.value) ? "chip-toggle on" : "chip-toggle"}
            aria-pressed={selected.includes(option.value)}
            disabled={disabled || (full && !selected.includes(option.value))}
            onClick={() => toggle(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
