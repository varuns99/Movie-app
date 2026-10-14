import { useEffect, useMemo, useState } from "react";
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
import { altTitle } from "./titles";
import { PickCard } from "./PickCard";
import { RouletteStrip } from "./RouletteStrip";
import { YearRange } from "./YearRange";
import { useRoulette } from "./useRoulette";
import type { MovieCandidate } from "./types";

type Props = {
  onSignIn?: () => void;
  onTrailer: (movie: { title: string; trailerUrl?: string }) => void;
};

type LoadState = "loading" | "ready" | "error";

// The signed-out Tonight screen: pick filters, spin, get a movie. No watchlist needed.
export function DiscoverView({ onSignIn, onTrailer }: Props) {
  const [filters, setFilters] = useState<DiscoverFilters>(defaultDiscoverFilters);
  const [movies, setMovies] = useState<MovieCandidate[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [sample, setSample] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [verifying, setVerifying] = useState(false);
  const [details, setDetails] = useState<MovieCandidate | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoadState("loading");
    setVerifying(false);
    const timeout = window.setTimeout(async () => {
      try {
        const result = await discoverMovies(filters, controller.signal);
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
  }, [filters, attempt]);

  const items = useMemo(() => movies.map((movie) => ({ ...movie, id: String(movie.tvdbId ?? movie.title) })), [movies]);
  const roulette = useRoulette(items);
  const selected = items.find((item) => item.id === roulette.selectedId);

  useEffect(() => {
    setDetails(selected ?? null);
    if (!selected) return;
    let active = true;
    loadMovieDetails(selected).then((full) => {
      if (active) setDetails(full);
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
        <h2>Find tonight&apos;s movie</h2>
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

      {details && (
        <PickCard
          title={details.title}
          altTitle={altTitle(details.title, details.englishTitle)}
          posterUrl={details.posterUrl}
          meta={[details.year, `${details.runtime} min`, details.genres.slice(0, 2).join(", ")].filter(Boolean).join(" · ")}
          synopsis={details.synopsis}
        >
          {details.trailerUrl && (
            <button onClick={() => onTrailer({ title: details.title, trailerUrl: details.trailerUrl })}>Trailer</button>
          )}
          <LockedFeature
            title="Sign in to save movies"
            body="Add this to your shared watchlist, rate it together and keep a history."
            onSignIn={onSignIn}
          >
            Save to watchlist
          </LockedFeature>
        </PickCard>
      )}

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
            <button className="spin-button" disabled={roulette.spinning || verifying} onClick={roulette.spin}>
              {roulette.spinning ? "Choosing..." : verifying ? "Checking languages..." : "Spin roulette"}
            </button>
            {sample && <p className="discover-note">Showing sample picks. Live movie search isn&apos;t set up here.</p>}
          </>
        )}
      </div>

    </section>
  );
}
