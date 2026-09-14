import { createDemoState } from "./demoData";
import type { AppState, Room } from "./types";

const STORAGE_KEY = "movie-night-roulette:v1";

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
      return createDemoState();
    }

    const parsed = JSON.parse(raw) as AppState;
    if (!parsed.room || !Array.isArray(parsed.movies)) {
      return createDemoState();
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
  const fresh = createDemoState();
  saveState(fresh);
  return fresh;
};
