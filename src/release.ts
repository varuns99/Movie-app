import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchMovieInfo } from "./discover";
import { releaseLabel, thisYear } from "./releaseDates";
import type { Movie, MovieCandidate } from "./types";

const STORAGE_KEY = "two-seats:release-info-v1";
// A film's status can change (a date is set, it comes out), so it is asked again
// after this long.
const MAX_AGE_MS = 6 * 60 * 60 * 1000;

type ReleaseInfo = { upcoming: boolean; releaseDate?: string; checkedAt: number };

const readStore = (): Record<string, ReleaseInfo> => {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, ReleaseInfo>) : {};
  } catch {
    return {};
  }
};

const writeStore = (store: Record<string, ReleaseInfo>) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Without storage the check simply runs again next time.
  }
};

// Remember what a search result said about a film, so it is treated correctly
// the moment it is added (before anything is asked again).
export const rememberRelease = (candidate: MovieCandidate) => {
  if (!candidate.tvdbId || typeof candidate.upcoming !== "boolean") return;
  const store = readStore();
  store[String(candidate.tvdbId)] = {
    upcoming: candidate.upcoming,
    releaseDate: candidate.releaseDate,
    checkedAt: Date.now(),
  };
  writeStore(store);
};

// Works out which saved films are not out yet. Films from before this year are
// out. Films from this year or later are asked about (and remembered for a few
// hours); until the answer is in, a later year counts as upcoming and this year
// as out. Only films that could be upcoming are ever asked about.
export const useReleaseStatus = (movies: Movie[], enabled: boolean) => {
  const [store, setStore] = useState(readStore);

  useEffect(() => {
    if (!enabled) return;
    // Read from storage, not from state, so an answer arriving does not restart the loop.
    const known = readStore();
    const stale = movies.filter((movie) => {
      if (!movie.tvdbId || movie.status === "watched" || Number(movie.year) < thisYear()) return false;
      const entry = known[String(movie.tvdbId)];
      return !entry || Date.now() - entry.checkedAt > MAX_AGE_MS;
    });
    if (!stale.length) return;

    let cancelled = false;
    (async () => {
      for (const movie of stale) {
        const info = await fetchMovieInfo(movie.tvdbId as number);
        if (cancelled) return;
        if (typeof info.upcoming !== "boolean") continue; // Could not ask: try again on a later visit.
        const entry: ReleaseInfo = { upcoming: info.upcoming, releaseDate: info.releaseDate, checkedAt: Date.now() };
        setStore((current) => {
          const next = { ...current, [String(movie.tvdbId)]: entry };
          writeStore(next);
          return next;
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [movies, enabled]);

  const infoFor = useCallback(
    (movie: Movie) => (movie.tvdbId ? store[String(movie.tvdbId)] : undefined),
    [store],
  );

  const isUnreleased = useCallback(
    (movie: Movie) => {
      if (movie.status === "watched") return false;
      if (Number(movie.year) > thisYear()) return true; // Cannot be out yet, whatever the service says.
      const info = infoFor(movie);
      return info ? info.upcoming : false;
    },
    [infoFor],
  );

  const releaseText = useCallback(
    (movie: Movie) => (isUnreleased(movie) ? releaseLabel(infoFor(movie)?.releaseDate, movie.year) : undefined),
    [isUnreleased, infoFor],
  );

  return useMemo(() => ({ isUnreleased, releaseText }), [isUnreleased, releaseText]);
};
