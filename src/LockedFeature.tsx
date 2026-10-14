import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

export function LockIcon() {
  return (
    <svg className="lock-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="3" y="7" width="10" height="7" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

type LockedFeatureProps = {
  // Visible content of the locked control, e.g. the tab name.
  children: ReactNode;
  className?: string;
  title: string;
  body: string;
  // Opens the sign-in window. Omit when accounts are not set up for this site.
  onSignIn?: () => void;
};

// A control that stays visible but locked while signed out. Hovering, focusing
// or clicking it explains what it does and offers to sign in.
export function LockedFeature({ children, className, title, body, onSignIn }: LockedFeatureProps) {
  const [pinned, setPinned] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [offset, setOffset] = useState(0);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const open = pinned || hovered;

  useEffect(() => {
    if (!pinned) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setPinned(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPinned(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [pinned]);

  // Keep the card inside the page on narrow phones. The app container is the
  // reference because the window width grows when something overflows it.
  useLayoutEffect(() => {
    const popover = popoverRef.current;
    if (!open || !popover) return;
    const bounds = wrapRef.current?.closest(".app-shell")?.getBoundingClientRect();
    const rect = popover.getBoundingClientRect();
    const margin = 12;
    const minLeft = (bounds?.left ?? 0) + margin;
    const maxRight = (bounds?.right ?? window.innerWidth) - margin;
    const naturalLeft = rect.left - offset;
    const naturalRight = rect.right - offset;
    const next = naturalRight > maxRight ? Math.min(0, maxRight - naturalRight) : 0;
    const clamped = naturalLeft + next < minLeft ? minLeft - naturalLeft : next;
    if (clamped !== offset) setOffset(clamped);
  }, [open, offset]);

  return (
    <span
      ref={wrapRef}
      className="locked-wrap"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        type="button"
        className={`locked-control ${className ?? ""}`}
        aria-disabled="true"
        aria-expanded={open}
        onClick={() => setPinned((current) => !current)}
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
      >
        {children}
        <LockIcon />
      </button>
      {open && (
        <div
          ref={popoverRef}
          className="signin-popover"
          role="dialog"
          aria-label={title}
          style={{ transform: `translateX(${offset}px)` }}
        >
          <strong>{title}</strong>
          <p>{body}</p>
          {onSignIn && (
            <button
              type="button"
              className="primary-button"
              onClick={() => {
                setPinned(false);
                setHovered(false);
                onSignIn();
              }}
            >
              Sign in
            </button>
          )}
        </div>
      )}
    </span>
  );
}
