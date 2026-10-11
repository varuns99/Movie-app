import { createDemoState } from "./demoData";
import type { AppState, Room } from "./types";

const STORAGE_KEY = "movie-night-roulette:v1";
// Ratings used to be 1-5. This flag records that locally saved scores are
// already on the 1-10 scale, so the one-time doubling below never repeats.
const RATING_SCALE_KEY = "movie-night-roulette:rating-scale";

const markRatingScale = () => {
  try {
    window.localStorage.setItem(RATING_SCALE_KEY, "10");
  } catch {
    // Not critical: the upgrade is simply skipped next time storage works.
  }
};

const upgradeOldRatings = (state: AppState): AppState => ({
  ...state,
  movies: state.movies.map((movie) => ({
    ...movie,
    ratings: Object.fromEntries(
      Object.entries(movie.ratings ?? {}).map(([member, rating]) => [
        member,
        rating ? { ...rating, score: rating.score * 2 } : rating,
      ]),
    ),
  })),
});

export const createId = () => {
  if ("crypto" in window && "randomUUID" in window.crypto) {
    return window.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

export const loadState = (): AppState => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      markRatingScale();
      return createDemoState();
    }

    const parsed = JSON.parse(raw) as AppState;
    if (!parsed.room || !Array.isArray(parsed.movies)) {
      markRatingScale();
      return createDemoState();
    }

    if (window.localStorage.getItem(RATING_SCALE_KEY) !== "10") {
      markRatingScale();
      return upgradeOldRatings(parsed);
    }

    return parsed;
  } catch {
    return createDemoState();
  }
};

export const saveState = (state: AppState) => {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
};

export const createRoom = (name: string, partnerA: string, partnerB: string): Room => ({
  id: createId(),
  name,
  partnerA,
  partnerB,
  createdAt: new Date().toISOString(),
});

export const resetState = () => {
  markRatingScale();
  const fresh = createDemoState();
  saveState(fresh);
  return fresh;
};
