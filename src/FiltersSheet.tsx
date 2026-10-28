import { useState } from "react";
import type { ReactNode } from "react";
import { Modal } from "./Modal";

type Props<T> = {
  // The filters currently in effect.
  applied: T;
  // What "Reset filters" goes back to.
  defaults: T;
  // Optional: what Reset does to the draft, e.g. to keep a sort order. Defaults to `defaults`.
  resetTo?: (draft: T) => T;
  onApply: (next: T) => void;
  // Plain-language recap of the applied filters, shown next to the button.
  summary: string;
  disabled?: boolean;
  // The filter controls. They edit a draft that only takes effect on Apply.
  children: (draft: T, change: (patch: Partial<T>) => void, close: () => void) => ReactNode;
};

const sameFilters = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// A "Filters" button that opens a window with the controls, a Reset at the top,
// and Cancel / Apply filters at the bottom. Nothing changes until Apply.
export function FiltersSheet<T>({ applied, defaults, resetTo, onApply, summary, disabled, children }: Props<T>) {
  const resetValue = (draft: T) => (resetTo ? resetTo(draft) : defaults);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<T>(applied);

  const openSheet = () => {
    setDraft(applied);
    setOpen(true);
  };
  const close = () => setOpen(false);

  return (
    <>
      <div className="filters-bar">
        <button type="button" className="filters-button" disabled={disabled} onClick={openSheet}>
          <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M2 4h12M4.5 8h7M7 12h2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          Filters
        </button>
        {/* Cut to two lines so the Tonight screen fits; the window shows everything. */}
        <p className="filter-summary" title={summary}>
          {summary}
        </p>
      </div>

      {open && (
        <Modal
          title="Filters"
          onClose={close}
          actions={
            <button
              type="button"
              className="link-button"
              disabled={sameFilters(draft, resetValue(draft))}
              onClick={() => setDraft(resetValue(draft))}
            >
              Reset filters
            </button>
          }
        >
          <div className="sheet-body">{children(draft, (patch) => setDraft((current) => ({ ...current, ...patch })), close)}</div>
          <div className="sheet-footer">
            <button type="button" onClick={close}>
              Cancel
            </button>
            <button
              type="button"
              className="primary-button"
              onClick={() => {
                onApply(draft);
                close();
              }}
            >
              Apply filters
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
