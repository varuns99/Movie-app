import { useLayoutEffect, useRef } from "react";
import type { ReactNode } from "react";
import { ImdbLink } from "./ImdbLink";
import { Modal } from "./Modal";

// The roulette's result, shown in a window as soon as a spin lands. The whole
// description is readable here (the window scrolls if it is long).
type Props = {
  // Window heading; the roulette's pick uses the default.
  heading?: string;
  title: string;
  // English title, shown small and faded under the title when it differs.
  altTitle?: string;
  posterUrl: string;
  // Year, runtime and genres, already joined for display.
  meta: string;
  // IMDb title id; shows a small "View on IMDb" link under the year and runtime.
  imdbId?: string;
  // Extra facts (genres, ratings, who added it) shown above the description.
  details?: ReactNode;
  synopsis?: string;
  // True while the description is still being fetched.
  loadingSynopsis?: boolean;
  onClose: () => void;
  // Buttons shown under the description.
  children?: ReactNode;
  // CSS selector of the poster on the page this window opens from; the poster
  // flies from there to its place in the window.
  flyFrom?: string;
};

const FLIGHT_MS = 520;

// Flies a copy of the poster from `selector` to the poster in the window. The
// copy lives on top of everything (the window would clip it), and the real
// poster appears when it lands. Without animation support, or when the user
// prefers reduced motion, the poster is simply there.
const useFlight = (selector: string | undefined) => {
  const posterRef = useRef<HTMLImageElement>(null);
  useLayoutEffect(() => {
    const poster = posterRef.current;
    if (!selector || !poster || typeof poster.animate !== "function") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const source = Array.from(document.querySelectorAll<HTMLElement>(selector)).find(
      (element) => element.getBoundingClientRect().width > 0,
    );
    const from = source?.getBoundingClientRect();
    const to = poster.getBoundingClientRect();
    if (!source || !from || !to.width) return;

    const ghost = document.createElement("img");
    ghost.src = poster.currentSrc || poster.src;
    ghost.alt = "";
    Object.assign(ghost.style, {
      position: "fixed",
      left: `${to.left}px`,
      top: `${to.top}px`,
      width: `${to.width}px`,
      height: `${to.height}px`,
      transformOrigin: "0 0",
      objectFit: "cover",
      borderRadius: "16px",
      boxShadow: "0 18px 48px rgba(0, 0, 0, 0.5)",
      pointerEvents: "none",
      zIndex: "50",
    });
    document.body.appendChild(ghost);
    const sourceOpacity = source.style.opacity;
    poster.style.visibility = "hidden";
    source.style.opacity = "0";

    const animation = ghost.animate(
      [
        {
          transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width}, ${from.height / to.height})`,
        },
        { transform: "none" },
      ],
      { duration: FLIGHT_MS, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)", fill: "both" },
    );
    const land = () => {
      window.clearTimeout(failsafe);
      poster.style.visibility = "";
      source.style.opacity = sourceOpacity;
      ghost.remove();
    };
    // If the animation never gets to run (a background tab), land anyway.
    const failsafe = window.setTimeout(land, FLIGHT_MS + 400);
    animation.onfinish = land;
    animation.oncancel = land;
    return () => {
      // A cancelled flight must not fire `land` later, over a newer one.
      animation.onfinish = null;
      animation.oncancel = null;
      animation.cancel();
      land();
    };
    // Only when the window opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return posterRef;
};

export function PickWindow({
  heading = "Tonight's pick",
  title,
  altTitle,
  posterUrl,
  meta,
  imdbId,
  details,
  synopsis,
  loadingSynopsis,
  onClose,
  children,
  flyFrom,
}: Props) {
  const posterRef = useFlight(flyFrom);
  return (
    <Modal title={heading} onClose={onClose} centered>
      <div className="pick-window">
        <img ref={posterRef} className="pick-poster" src={posterUrl} alt="" />
        <div className="pick-body">
          <h3>{title}</h3>
          {altTitle && <p className="alt-title">({altTitle})</p>}
          <p className="pick-meta">{meta}</p>
          <ImdbLink imdbId={imdbId} />
          {details}
          {synopsis ? (
            <p className="pick-synopsis">{synopsis}</p>
          ) : (
            loadingSynopsis && <p className="pick-synopsis pick-loading">Loading the description...</p>
          )}
          {children && <div className="pick-actions">{children}</div>}
        </div>
      </div>
    </Modal>
  );
}
