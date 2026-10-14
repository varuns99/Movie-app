import type { ReactNode } from "react";

type Props = {
  title: string;
  posterUrl: string;
  // Year, runtime and genres, already joined for display.
  meta: string;
  synopsis?: string;
  // Buttons shown under the synopsis.
  children?: ReactNode;
};

// The roulette's result: a poster-led card shown above the spinning strip.
export function PickCard({ title, posterUrl, meta, synopsis, children }: Props) {
  return (
    <article className="best-card winner-card">
      <img src={posterUrl} alt="" />
      <div className="best-body">
        <h2>Tonight&apos;s pick</h2>
        <h3>{title}</h3>
        <p>{meta}</p>
        {synopsis && <p className="winner-synopsis">{synopsis}</p>}
        {children && <div className="winner-actions">{children}</div>}
      </div>
    </article>
  );
}
