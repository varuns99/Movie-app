import { useEffect, useMemo, useRef, useState } from "react";
import {
  ALL_YEARS,
  DISCOVER_GENRES,
  DISCOVER_LANGUAGES,
  MAX_DISCOVER_RUNTIME,
  MAX_GENRES,
  defaultDiscoverFilters,
  discoverMovies,
  findLanguageMismatches,
  loadMovieDetails,
} from "./discover";
import type { DiscoverFilters } from "./discover";
import { ChipSelect } from "./ChipSelect";
import { EmptyState } from "./EmptyState";
import { FiltersSheet } from "./FiltersSheet";
import { LockedFeature } from "./LockedFeature";
import { listSummary, yearSummary } from "./filterText";
import { altTitle, titleKey } from "./titles";
import { PickWindow } from "./PickWindow";
import { usePickWindow } from "./usePickWindow";
import { RouletteStrip } from "./RouletteStrip";
import { YearRange } from "./YearRange";
import { useRoulette } from "./useRoulette";
import type { ActionResult } from "./cloudData";
import type { Movie, MovieCandidate } from "./types";

type Props = {
  // Signed out: how to open sign-in (the watchlist features are locked).
  onSignIn?: () => void;
  onTrailer: (movie: { title: string; trailerUrl?: string }) => void;
  // Signed in: the room's watchlist, so films already on it are left out, and how to add a pick to it.
  saved?: Movie[];
  onSave?: (movie: MovieCandidate) => Promise<ActionResult>;
};

type LoadState = "loading" | "ready" | "error";

// Pick filters, spin, get a movie from the whole catalogue. Signed out this is the
// Tonight screen; signed in it is "Discover": new films only, never ones already
// on the watchlist, and a pick can be added to it.
export function DiscoverView({ onSignIn, onTrailer, saved, onSave }: Props) {
  const signedIn = Boolean(onSave);
  const [filters, setFilters] = useState<DiscoverFilters>(defaultDiscoverFilters);
  const [movies, setMovies] = useState<MovieCandidate[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [sample, setSample] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [verifying, setVerifying] = useState(false);
  const [details, setDetails] = useState<MovieCandidate | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [addedTitle, setAddedTitle] = useState("");

  // Films already on the watchlist, matched by TVDB id, or by title and year for ones added by hand.
  const savedKeys = useMemo(() => {
    const list = saved ?? [];
    const keys = new Set<string>();
    list.forEach((movie) => {
      if (movie.tvdbId) keys.add(`id:${movie.tvdbId}`);
      keys.add(`t:${titleKey(movie.title)}|${movie.year}`);
      if (movie.englishTitle) keys.add(`t:${titleKey(movie.englishTitle)}|${movie.year}`);
    });
    return keys;
  }, [saved]);
  const isSaved = useMemo(
    () => (movie: MovieCandidate) =>
      Boolean(movie.tvdbId && savedKeys.has(`id:${movie.tvdbId}`)) || savedKeys.has(`t:${titleKey(movie.title)}|${movie.year}`),
    [savedKeys],
  );
  const isSavedRef = useRef(isSaved);
  isSavedRef.current = isSaved;

  useEffect(() => {
    const controller = new AbortController();
    setLoadState("loading");
    setVerifying(false);
    const timeout = window.setTimeout(async () => {
      try {
        const result = await discoverMovies(filters, controller.signal, signedIn ? isSavedRef.current : undefined);
        setMovies(result.movies);
        setSample(result.sample);
        setLoadState("ready");

        // The list shows right away; Spin waits a moment while Wikidata
        // double-checks the language, then films in other languages drop out.
        if (!result.sample && filters.language !== "any") {
          setVerifying(true);
          const wrong = await findLanguageMismatches(result.movies, filters.language, controller.signal);
          if (controller.signal.aborted) return;
          if (wrong.size) setMovies((current) => current.filter((movie) => !wrong.has(String(movie.tvdbId))));
          setVerifying(false);
        }
      } catch (error: unknown) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setMovies([]);
        setLoadState("error");
      }
    }, 350);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [filters, attempt, signedIn]);

  // Anything added to the watchlist since the list loaded drops out at once.
  const items = useMemo(
    () => movies.filter((movie) => !signedIn || !isSaved(movie)).map((movie) => ({ ...movie, id: String(movie.tvdbId ?? movie.title) })),
    [movies, signedIn, isSaved],
  );
  const roulette = useRoulette(items);
  const selected = items.find((item) => item.id === roulette.selectedId);
  const pick = usePickWindow(roulette.selectedId);

  useEffect(() => {
    setDetails(selected ?? null);
    setDetailsLoading(Boolean(selected));
    if (!selected) return;
    let active = true;
    loadMovieDetails(selected)
      .then((full) => {
        if (active) setDetails(full);
      })
      .finally(() => {
        if (active) setDetailsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selected]);

  const languageLabel = DISCOVER_LANGUAGES.find((language) => language.code === filters.language)?.label ?? "Any language";
  const filterSummary = [
    languageLabel,
    yearSummary(filters.yearFrom, filters.yearTo, ALL_YEARS[ALL_YEARS.length - 1], ALL_YEARS[0]),
    listSummary(filters.genres, "Any genre"),
    filters.maxRuntime >= MAX_DISCOVER_RUNTIME ? "Any length" : `Up to ${filters.maxRuntime} min`,
  ].join(" · ");

  return (
    <section className="panel roulette-panel discover">
      <div className="section-heading">
        <h2>{signedIn ? "Discover something new" : "Find tonight's movie"}</h2>
        <span>{loadState === "ready" ? `${items.length} to spin` : ""}</span>
      </div>

      <FiltersSheet
        applied={filters}
        defaults={defaultDiscoverFilters}
        onApply={setFilters}
        summary={filterSummary}
        disabled={roulette.spinning}
      >
        {(draft, change, close) => (
          <div className="filters">
            <label>
              Language
              <select value={draft.language} onChange={(event) => change({ language: event.target.value })}>
                {DISCOVER_LANGUAGES.map((language) => (
                  <option key={language.code} value={language.code}>
                    {language.label}
                  </option>
                ))}
              </select>
            </label>
            {!signedIn && (
              <div className="toggle-row locked-toggle-row">
                <LockedFeature
                  className="locked-toggle"
                  title="Sign in to filter by unwatched"
                  body="This uses your shared watchlist, so you only spin movies you haven't seen yet."
                  onSignIn={
                    onSignIn
                      ? () => {
                          close();
                          onSignIn();
                        }
                      : undefined
                  }
                >
                  <span className="fake-check" aria-hidden="true" />
                  Only unwatched
                </LockedFeature>
              </div>
            )}
            <YearRange
              from={draft.yearFrom}
              to={draft.yearTo}
              years={ALL_YEARS}
              onChange={(yearFrom, yearTo) => change({ yearFrom, yearTo })}
            />
            <label>
              Max runtime
              <input
                type="range"
                min="80"
                max={MAX_DISCOVER_RUNTIME}
                step="5"
                value={draft.maxRuntime}
                onChange={(event) => change({ maxRuntime: Number(event.target.value) })}
              />
              <strong>{draft.maxRuntime >= MAX_DISCOVER_RUNTIME ? "Any" : `${draft.maxRuntime} min`}</strong>
            </label>
            <ChipSelect
              label="Genre"
              options={DISCOVER_GENRES.map((genre) => ({ value: genre, label: genre }))}
              selected={draft.genres}
              max={MAX_GENRES}
              onChange={(genres) => change({ genres })}
            />
          </div>
        )}
      </FiltersSheet>

      <div className="roulette-stage" aria-live="polite">
        {loadState === "loading" && (
          <>
            <div className="roulette-strip" aria-hidden="true">
              {Array.from({ length: 6 }, (_, index) => (
                <div key={index} className="roulette-tile skeleton">
                  <div className="skeleton-poster" />
                </div>
              ))}
            </div>
            <p className="discover-note">Finding movies...</p>
          </>
        )}
        {loadState === "error" && (
          <div className="empty-state">
            <h3>Couldn&apos;t load movies</h3>
            <p>Check your connection and try again.</p>
            <button type="button" onClick={() => setAttempt((current) => current + 1)}>
              Try again
            </button>
          </div>
        )}
        {loadState === "ready" && !items.length && (
          <EmptyState title="No movies match" body="Widen the release years or loosen a filter and try again." />
        )}
        {loadState === "ready" && items.length > 0 && (
          <>
            <RouletteStrip
              items={items}
              activeIndex={roulette.activeIndex}
              spinning={roulette.spinning}
              tileRefs={roulette.tileRefs}
            />
            <button
              className="spin-button"
              disabled={roulette.spinning || verifying}
              onClick={() => {
                setAddedTitle("");
                setSaveError("");
                roulette.spin();
              }}
            >
              {roulette.spinning ? "Choosing..." : verifying ? "Checking languages..." : "Spin roulette"}
            </button>
            {selected && !pick.open && (
              <button type="button" className="link-button view-pick" onClick={pick.show}>
                View tonight&apos;s pick
              </button>
            )}
            {addedTitle && (
              <p className="discover-note added-note" role="status">
                Added &ldquo;{addedTitle}&rdquo; to your watchlist.
              </p>
            )}
            {sample && <p className="discover-note">Showing sample picks. Live movie search isn&apos;t set up here.</p>}
          </>
        )}
      </div>

      {details && pick.open && (
        <PickWindow
          title={details.title}
          altTitle={altTitle(details.title, details.englishTitle)}
          posterUrl={details.posterUrl}
          imdbId={details.imdbId}
          meta={[details.year, `${details.runtime} min`, details.genres.slice(0, 2).join(", ")].filter(Boolean).join(" · ")}
          synopsis={details.synopsis}
          loadingSynopsis={detailsLoading}
          onClose={pick.close}
        >
          {details.trailerUrl && (
            <button onClick={() => onTrailer({ title: details.title, trailerUrl: details.trailerUrl })}>Trailer</button>
          )}
          {signedIn ? (
            <button
              className="primary-button"
              disabled={saving}
              onClick={async () => {
                if (!onSave) return;
                setSaving(true);
                setSaveError("");
                const result = await onSave(details);
                setSaving(false);
                if (result.ok) {
                  setAddedTitle(details.title);
                  pick.close();
                } else {
                  setSaveError(result.message);
                }
              }}
            >
              {saving ? "Adding..." : "Add to watchlist"}
            </button>
          ) : (
            <LockedFeature
              title="Sign in to save movies"
              body="Add this to your shared watchlist, rate it together and keep a history."
              onSignIn={
                onSignIn
                  ? () => {
                      pick.close();
                      onSignIn();
                    }
                  : undefined
              }
            >
              Save to watchlist
            </LockedFeature>
          )}
          {saveError && (
            <p className="auth-message error" role="alert">
              {saveError}
            </p>
          )}
        </PickWindow>
      )}

    </section>
  );
}
