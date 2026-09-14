export type PartnerId = "partnerA" | "partnerB";

export type WatchStatus = "unwatched" | "watched";

export type Mood =
  | "cozy"
  | "funny"
  | "romantic"
  | "tense"
  | "scary"
  | "weird"
  | "low-effort";

export type Rating = {
  score: number;
  note: string;
  ratedAt: string;
};

export type Movie = {
  id: string;
  source: "demo" | "tmdb" | "manual";
  tmdbId?: number;
  title: string;
  year: string;
  runtime: number;
  genres: string[];
  moods: Mood[];
  synopsis: string;
  posterUrl: string;
  trailerUrl?: string;
  addedBy: PartnerId;
  addedAt: string;
  status: WatchStatus;
  watchedAt?: string;
  ratings: Partial<Record<PartnerId, Rating>>;
};

export type Room = {
  id: string;
  name: string;
  partnerA: string;
  partnerB: string;
  createdAt: string;
};

export type AppState = {
  room: Room;
  movies: Movie[];
};

export type MovieCandidate = {
  source: "demo" | "tmdb" | "manual";
  tmdbId?: number;
  title: string;
  year: string;
  runtime: number;
  genres: string[];
  moods: Mood[];
  synopsis: string;
  posterUrl: string;
  trailerUrl?: string;
};

export type RouletteFilters = {
  maxRuntime: number;
  genre: string;
  mood: Mood | "any";
  onlyUnwatched: boolean;
};

export type TasteProfile = {
  favoriteGenres: string[];
  topMoods: Mood[];
  preferredRuntime: number;
  watchedCount: number;
};
