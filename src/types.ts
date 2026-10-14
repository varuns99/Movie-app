// Anyone who can add or rate movies: their account (user) id.
export type MemberId = string;

export type Member = {
  id: MemberId;
  displayName: string;
};

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
  source: "demo" | "tvdb" | "manual";
  tvdbId?: number;
  title: string;
  year: string;
  runtime: number;
  genres: string[];
  moods: Mood[];
  synopsis: string;
  posterUrl: string;
  trailerUrl?: string;
  // Original language as a three-letter code ("eng"); unknown for older or manual movies.
  language?: string;
  // English title when it differs from `title` (the film's own name).
  englishTitle?: string;
  addedBy: MemberId;
  addedAt: string;
  status: WatchStatus;
  watchedAt?: string;
  ratings: Partial<Record<MemberId, Rating>>;
};

export type MovieCandidate = {
  source: "demo" | "tvdb" | "manual";
  tvdbId?: number;
  title: string;
  year: string;
  runtime: number;
  genres: string[];
  moods: Mood[];
  synopsis: string;
  posterUrl: string;
  trailerUrl?: string;
  searchTerms?: string[];
  // Original language as a three-letter code ("eng", "jpn"); used by discovery filters.
  language?: string;
  englishTitle?: string;
};

export type RouletteFilters = {
  maxRuntime: number;
  // Empty means "any". A movie matches if it has at least one chosen genre / mood.
  genres: string[];
  language: string;
  moods: Mood[];
  yearFrom: number;
  yearTo: number;
  onlyUnwatched: boolean;
};

export type TasteProfile = {
  favoriteGenres: string[];
  topMoods: Mood[];
  preferredRuntime: number;
  watchedCount: number;
};

export type CloudRoom = {
  id: string;
  name: string;
  inviteCode: string;
};

export type CloudMember = {
  userId: string;
  displayName: string;
};
