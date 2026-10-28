import { useEffect, useState } from "react";
import { languageName, loadMovieDetails } from "./discover";
import { PickWindow } from "./PickWindow";
import { isUpcomingCandidate, releaseLabel } from "./releaseDates";
import { altTitle, titleMeta } from "./titles";
import { TrailerButton } from "./TrailerButton";
import { normalizeTrailerUrl } from "./trailers";
import type { MovieCandidate } from "./types";

type Props = {
  candidate: MovieCandidate;
  // Already on the watchlist (also true right after it has been added).
  added: boolean;
  // Resolves to true when it was added.
  onAdd: (movie: MovieCandidate) => Promise<boolean>;
  onTrailer: (movie: MovieCandidate) => void;
  onClose: () => void;
  // CSS selector of the result's poster, so the poster flies from there.
  flyFrom?: string;
};

// A search result opened in a window before adding it: the full description,
// trailer and IMDb link (fetched as a movie or a series, whichever it is), and an
// "Add to watchlist" button.
export function SearchPreview({ candidate, added, onAdd, onTrailer, onClose, flyFrom }: Props) {
  const [details, setDetails] = useState<MovieCandidate | null>(null);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    let live = true;
    loadMovieDetails(candidate)
      .then((loaded) => {
        if (live) setDetails(loaded);
      })
      .catch(() => {
        // The search result's own facts are shown instead.
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [candidate]);

  const movie = details ?? candidate;
  const upcoming = isUpcomingCandidate(movie);
  const trailer = normalizeTrailerUrl(movie.trailerUrl);

  return (
    <PickWindow
      heading={movie.kind === "series" ? "Series details" : "Movie details"}
      title={movie.title}
      altTitle={altTitle(movie.title, movie.englishTitle)}
      posterUrl={candidate.posterUrl}
      imdbId={movie.imdbId}
      meta={titleMeta(movie, " · ")}
      details={
        <div className="view-details">
          {upcoming && <p className="upcoming-note">Not out yet ({releaseLabel(movie.releaseDate, movie.year)}).</p>}
          {movie.genres.length > 0 && <p className="chip-row">{movie.genres.join(" · ")}</p>}
          {movie.language && (
            <p className="meta-row">
              <span>{languageName(movie.language)}</span>
            </p>
          )}
        </div>
      }
      synopsis={movie.synopsis}
      loadingSynopsis={loading}
      onClose={onClose}
      flyFrom={flyFrom}
    >
      <button
        type="button"
        className="primary-button"
        disabled={added || adding}
        onClick={async () => {
          setAdding(true);
          await onAdd(movie);
          setAdding(false);
        }}
      >
        {added ? "On your watchlist" : adding ? "Adding..." : "Add to watchlist"}
      </button>
      {trailer && <TrailerButton onClick={() => onTrailer(movie)} />}
    </PickWindow>
  );
}
