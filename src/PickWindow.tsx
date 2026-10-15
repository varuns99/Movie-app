import type { ReactNode } from "react";
import { ImdbLink } from "./ImdbLink";
import { Modal } from "./Modal";

// The roulette's result, shown in a window as soon as a spin lands. The whole
// description is readable here (the window scrolls if it is long).
type Props = {
  title: string;
  // English title, shown small and faded under the title when it differs.
  altTitle?: string;
  posterUrl: string;
  // Year, runtime and genres, already joined for display.
  meta: string;
  // IMDb title id; shows a small "View on IMDb" link under the year and runtime.
  imdbId?: string;
  synopsis?: string;
  // True while the description is still being fetched.
  loadingSynopsis?: boolean;
  onClose: () => void;
  // Buttons shown under the description.
  children?: ReactNode;
};

export function PickWindow({ title, altTitle, posterUrl, meta, imdbId, synopsis, loadingSynopsis, onClose, children }: Props) {
  return (
    <Modal title="Tonight's pick" onClose={onClose} centered>
      <div className="pick-window">
        <img className="pick-poster" src={posterUrl} alt="" />
        <div className="pick-body">
          <h3>{title}</h3>
          {altTitle && <p className="alt-title">({altTitle})</p>}
          <p className="pick-meta">{meta}</p>
          <ImdbLink imdbId={imdbId} />
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
