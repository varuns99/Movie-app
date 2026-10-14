import type { ReactNode } from "react";

type Props = {
  id: string;
  // One-line recap of the active filters, shown while the section is closed.
  summary: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
};

export function CollapsibleFilters({ id, summary, open, onToggle, children }: Props) {
  return (
    <>
      <button type="button" className="filters-toggle" aria-expanded={open} aria-controls={id} onClick={onToggle}>
        <span className="filters-toggle-label">Filters</span>
        <span className="filters-toggle-summary">{summary}</span>
        <svg className="chevron" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <div id={id} className={open ? "collapse open" : "collapse"} inert={!open}>
        <div className="collapse-inner">{children}</div>
      </div>
    </>
  );
}
