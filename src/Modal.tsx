import { useEffect } from "react";
import type { ReactNode } from "react";

export function Modal({
  title,
  children,
  onClose,
  wide = false,
  actions,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  // Extra controls shown in the header, left of the close button.
  actions?: ReactNode;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className={wide ? "modal wide" : "modal"}>
        <div className="modal-heading">
          <h2>{title}</h2>
          <div className="modal-heading-end">
            {actions}
            <button className="modal-close" onClick={onClose} aria-label="Close">
              ×
            </button>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
