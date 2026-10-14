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

export type CloudRoom = {
  id: string;
  name: string;
  inviteCode: string;
};

export type CloudMember = {
  userId: string;
  displayName: string;
};
