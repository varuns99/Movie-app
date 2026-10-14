type Props = {
  from: number;
  to: number;
  // Newest first, e.g. [2026, 2025, ...].
  years: number[];
  onChange: (from: number, to: number) => void;
  disabled?: boolean;
};

// "Released between  [2024] to [2026]" on one line. The two years never cross.
export function YearRange({ from, to, years, onChange, disabled }: Props) {
  return (
    <div className="year-range" role="group" aria-label="Released between">
      <span className="year-range-label">Released between</span>
      <div className="year-range-row">
        <select
          aria-label="From year"
          disabled={disabled}
          value={from}
          onChange={(event) => {
            const next = Number(event.target.value);
            onChange(next, Math.max(next, to));
          }}
        >
          {years.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
        <span className="year-range-to">to</span>
        <select
          aria-label="To year"
          disabled={disabled}
          value={to}
          onChange={(event) => {
            const next = Number(event.target.value);
            onChange(Math.min(next, from), next);
          }}
        >
          {years.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
