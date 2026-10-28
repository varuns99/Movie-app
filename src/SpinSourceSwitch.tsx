export type SpinSource = "roulette" | "discover";

const sources: { value: SpinSource; label: string }[] = [
  { value: "roulette", label: "Watchlist" },
  { value: "discover", label: "Discover" },
];

// Inside Spin: spin your own watchlist, or discover something new from the whole
// catalogue. Shown at the top of either roulette panel.
export function SpinSourceSwitch({
  value,
  onChange,
  disabled,
}: {
  value: SpinSource;
  onChange: (source: SpinSource) => void;
  disabled?: boolean;
}) {
  return (
    <div className="source-switch" role="radiogroup" aria-label="Spin from">
      {sources.map((source) => (
        <button
          key={source.value}
          type="button"
          role="radio"
          aria-checked={value === source.value}
          className={value === source.value ? "active" : ""}
          disabled={disabled}
          onClick={() => onChange(source.value)}
        >
          {source.label}
        </button>
      ))}
    </div>
  );
}
