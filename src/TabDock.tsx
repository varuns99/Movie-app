import { useLayoutEffect, useRef } from "react";
import type { ReactNode } from "react";
import { LockedFeature } from "./LockedFeature";

export type DockItem = {
  id: string;
  label: string;
  icon: ReactNode;
  // Signed out: the tab stays visible but explains it needs an account.
  locked?: { title: string; body: string };
};

// The bar's shape. The selected tab sits in a round "bead" that rises out of the
// bar, and the bar's top edge curves down around it (a notch with soft shoulders).
const BAR_HEIGHT = 64;
const CORNER = 20;
const BEAD = 50;
// Space between the bead and the notch, and the bead's centre relative to the
// bar's top edge (negative is above it).
const GAP = 6;
const BEAD_Y = -3;
const NOTCH = BEAD / 2 + GAP;
const SHOULDER = 10;

// One side of the notch: where the top edge starts to bend (x on the top edge)
// and where the shoulder meets the notch circle.
const shoulder = (cx: number, side: -1 | 1, radius: number) => {
  const reach = NOTCH + radius;
  const fx = cx + side * Math.sqrt(reach ** 2 - (radius - BEAD_Y) ** 2);
  const tx = cx + ((fx - cx) * NOTCH) / reach;
  const ty = BEAD_Y + ((radius - BEAD_Y) * NOTCH) / reach;
  return { fx, tx, ty };
};

// The outline of the bar with the notch centred at `cx`. A moving bead stretches
// the shoulder behind it a little, so the bar looks like it melts around the bead.
const barPath = (width: number, cx: number, velocity: number) => {
  const stretch = Math.min(Math.abs(velocity) / 1600, 0.7);
  const left = SHOULDER * (1 + (velocity > 0 ? stretch : 0));
  const right = SHOULDER * (1 + (velocity < 0 ? stretch : 0));
  const l = shoulder(cx, -1, left);
  const r = shoulder(cx, 1, right);
  const h = BAR_HEIGHT;
  const c = CORNER;
  const f = (n: number) => n.toFixed(2);
  return [
    `M ${c} 0`,
    `L ${f(Math.max(c, l.fx))} 0`,
    `A ${f(left)} ${f(left)} 0 0 1 ${f(l.tx)} ${f(l.ty)}`,
    `A ${NOTCH} ${NOTCH} 0 0 0 ${f(r.tx)} ${f(r.ty)}`,
    `A ${f(right)} ${f(right)} 0 0 1 ${f(Math.min(width - c, r.fx))} 0`,
    `L ${width - c} 0`,
    `A ${c} ${c} 0 0 1 ${width} ${c}`,
    `L ${width} ${h - c}`,
    `A ${c} ${c} 0 0 1 ${width - c} ${h}`,
    `L ${c} ${h}`,
    `A ${c} ${c} 0 0 1 0 ${h - c}`,
    `L 0 ${c}`,
    `A ${c} ${c} 0 0 1 ${c} 0`,
    "Z",
  ].join(" ");
};

// Spring for the bead: critically damped (no bounce), and a new tap mid-way
// carries on from where the bead is, at the speed it is going.
const STIFFNESS = 260;
const DAMPING = 2 * Math.sqrt(STIFFNESS);

// The section tabs, pinned to the bottom of the screen.
export function TabDock({
  items,
  active,
  onSelect,
  onSignIn,
}: {
  items: DockItem[];
  active: string;
  onSelect: (id: string) => void;
  onSignIn?: () => void;
}) {
  const dockRef = useRef<HTMLElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const beadRef = useRef<HTMLDivElement>(null);
  const motion = useRef({ x: -1, v: 0, target: 0, width: 0, frame: 0, last: 0 });
  const activeIndex = Math.max(
    0,
    items.findIndex((item) => item.id === active),
  );

  useLayoutEffect(() => {
    const dock = dockRef.current;
    if (!dock) return;
    const state = motion.current;

    const draw = () => {
      pathRef.current?.setAttribute("d", barPath(state.width, state.x, state.v));
      if (beadRef.current) beadRef.current.style.transform = `translate3d(${state.x - BEAD / 2}px, 0, 0)`;
    };

    const step = (time: number) => {
      const dt = Math.min((time - state.last) / 1000, 1 / 30);
      state.last = time;
      const force = -STIFFNESS * (state.x - state.target) - DAMPING * state.v;
      state.v += force * dt;
      state.x += state.v * dt;
      if (Math.abs(state.x - state.target) < 0.3 && Math.abs(state.v) < 4) {
        state.x = state.target;
        state.v = 0;
        state.frame = 0;
        draw();
        return;
      }
      draw();
      state.frame = requestAnimationFrame(step);
    };

    // Where the selected tab's centre is, measured from the bar's left edge.
    const place = (animate: boolean) => {
      const tabs = dock.querySelectorAll<HTMLElement>(".dock-slot");
      const tab = tabs[activeIndex];
      if (!tab) return;
      state.width = dock.clientWidth;
      state.target = tab.offsetLeft + tab.offsetWidth / 2;
      const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      // A size change in the middle of a glide only moves the destination.
      if (!animate && state.frame && !still) return;
      if (!animate || still || state.x < 0) {
        cancelAnimationFrame(state.frame);
        state.frame = 0;
        state.x = state.target;
        state.v = 0;
        draw();
        return;
      }
      if (!state.frame) {
        state.last = performance.now();
        state.frame = requestAnimationFrame(step);
      }
    };

    place(true);
    // Only a real size change snaps the bead (the observer also fires once on start).
    const observer = new ResizeObserver(() => {
      if (dock.clientWidth !== state.width) place(false);
    });
    observer.observe(dock);
    return () => observer.disconnect();
  }, [activeIndex]);

  useLayoutEffect(() => () => cancelAnimationFrame(motion.current.frame), []);

  return (
    <nav ref={dockRef} className="tab-dock" aria-label="Sections">
      <svg className="dock-shape" aria-hidden="true">
        <path ref={pathRef} />
      </svg>
      <div ref={beadRef} className="dock-bead" aria-hidden="true">
        {items.map((item, index) => (
          <span key={item.id} className={index === activeIndex ? "dock-bead-icon shown" : "dock-bead-icon"}>
            {item.icon}
          </span>
        ))}
      </div>
      {items.map((item, index) => {
        const selected = index === activeIndex;
        const content = (
          <>
            <span className="dock-icon">{item.icon}</span>
            <span className="dock-label">{item.label}</span>
          </>
        );
        return (
          <div key={item.id} className={selected ? "dock-slot selected" : "dock-slot"}>
            {item.locked ? (
              <LockedFeature className="dock-tab" title={item.locked.title} body={item.locked.body} onSignIn={onSignIn}>
                {content}
              </LockedFeature>
            ) : (
              <button
                type="button"
                className="dock-tab"
                aria-current={selected ? "page" : undefined}
                onClick={() => onSelect(item.id)}
              >
                {content}
              </button>
            )}
          </div>
        );
      })}
    </nav>
  );
}

// Line icons for the three sections (24px grid, drawn with the text colour).
const iconProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export function TonightIcon() {
  return (
    <svg {...iconProps}>
      {/* A clapperboard: the board, and the striped arm opened up from its left hinge. */}
      <path d="M3.5 11h17v7.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2Z" />
      <path d="M3.5 11 2.9 8.2a1 1 0 0 1 .77-1.19L18.4 3.9a1 1 0 0 1 1.19.77L20 6.6Z" />
      <path d="m8.6 6 1.6 3.2M14 4.9l1.6 2.9" />
    </svg>
  );
}

export function WatchlistIcon() {
  return (
    <svg {...iconProps}>
      <path d="M7 3.5h10a1 1 0 0 1 1 1V20l-6-3.8L6 20V4.5a1 1 0 0 1 1-1Z" />
    </svg>
  );
}

export function ProfileIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="12" cy="8.5" r="3.75" />
      <path d="M4.5 20c.9-3.7 3.9-5.75 7.5-5.75s6.6 2.05 7.5 5.75" />
    </svg>
  );
}

export function HistoryIcon() {
  return (
    <svg {...iconProps}>
      <path d="M3.5 12a8.5 8.5 0 1 0 2.5-6" />
      <path d="M3.5 4v4h4" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}
