import { useRef } from "react";
import type { CSSProperties } from "react";

type Option<T extends string> = { value: T; label: string };

type Props<T extends string> = {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
};

// A pill with a sliding thumb: pick one of a few options. Built as a radio group,
// so the arrow keys move between options.
export function SegmentedToggle<T extends string>({ options, value, onChange, label }: Props<T>) {
  const index = Math.max(0, options.findIndex((option) => option.value === value));
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  const select = (next: number) => {
    const target = (next + options.length) % options.length;
    onChange(options[target].value);
    buttons.current[target]?.focus();
  };

  return (
    <div
      className="segmented"
      role="radiogroup"
      aria-label={label}
      style={{ "--count": options.length, "--index": index } as CSSProperties}
    >
      <span className="segmented-thumb" aria-hidden="true" />
      {options.map((option, position) => (
        <button
          key={option.value}
          ref={(node) => {
            buttons.current[position] = node;
          }}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          tabIndex={option.value === value ? 0 : -1}
          onClick={() => onChange(option.value)}
          onKeyDown={(event) => {
            if (event.key === "ArrowRight" || event.key === "ArrowDown") {
              event.preventDefault();
              select(position + 1);
            } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
              event.preventDefault();
              select(position - 1);
            } else if (event.key === "Home") {
              event.preventDefault();
              select(0);
            } else if (event.key === "End") {
              event.preventDefault();
              select(options.length - 1);
            }
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
