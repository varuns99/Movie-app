import { useRef } from "react";
import type { TouchEvent } from "react";

const MIN_DISTANCE = 70;
// How much more sideways than up-and-down a swipe must be, so scrolling the page is never mistaken for one.
const SIDEWAYS_RATIO = 1.8;
const MAX_DURATION_MS = 700;
// The phone's own back gesture starts at the screen edges.
const EDGE_PX = 24;

// True when a swipe starting on this element belongs to something else:
// a text box, a slider, a menu or window, or a row that scrolls sideways.
const ownsSwipe = (target: EventTarget | null) => {
  let element = target instanceof Element ? target : null;
  while (element && element !== document.body) {
    if (element.matches("input, select, textarea, [role=dialog], [role=menu], .search-dropdown")) return true;
    if (element instanceof HTMLElement) {
      const overflowX = window.getComputedStyle(element).overflowX;
      if ((overflowX === "auto" || overflowX === "scroll") && element.scrollWidth > element.clientWidth + 1) return true;
    }
    element = element.parentElement;
  }
  return false;
};

// Swiping left or right on a touch screen. `onSwipe(1)` is a swipe to the left
// (the next thing), `onSwipe(-1)` to the right (the previous). Ignored while a
// window is open.
export const useSwipeNavigation = (onSwipe: (direction: 1 | -1) => void) => {
  const start = useRef<{ x: number; y: number; time: number } | null>(null);

  return {
    onTouchStart: (event: TouchEvent) => {
      const touch = event.touches[0];
      const blocked =
        event.touches.length !== 1 ||
        !touch ||
        touch.clientX < EDGE_PX ||
        touch.clientX > window.innerWidth - EDGE_PX ||
        Boolean(document.querySelector("[role=dialog]")) ||
        ownsSwipe(event.target);
      start.current = blocked ? null : { x: touch.clientX, y: touch.clientY, time: Date.now() };
    },
    onTouchEnd: (event: TouchEvent) => {
      const from = start.current;
      start.current = null;
      const touch = event.changedTouches[0];
      if (!from || !touch) return;
      const dx = touch.clientX - from.x;
      const dy = touch.clientY - from.y;
      if (Math.abs(dx) < MIN_DISTANCE || Math.abs(dx) < Math.abs(dy) * SIDEWAYS_RATIO) return;
      if (Date.now() - from.time > MAX_DURATION_MS) return;
      onSwipe(dx < 0 ? 1 : -1);
    },
    onTouchCancel: () => {
      start.current = null;
    },
  };
};
