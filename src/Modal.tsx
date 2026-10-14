import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

// Windows can open on top of each other (the trailer over the pick). Escape
// closes only the one on top.
const openWindows: object[] = [];

export function Modal({
  title,
  children,
  onClose,
  wide = false,
  centered = false,
  actions,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  // Sits in the middle of the screen on phones too, instead of rising from the bottom.
  centered?: boolean;
  // Extra controls shown in the header, left of the close button.
  actions?: ReactNode;
}) {
  const token = useRef({}).current;
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    openWindows.push(token);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && openWindows[openWindows.length - 1] === token) close.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      openWindows.splice(openWindows.indexOf(token), 1);
    };
  }, [token]);

  return (
    <div
      className={centered ? "modal-backdrop centered" : "modal-backdrop"}
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
