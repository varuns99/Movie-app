// The two fixed slots used by the signed-out demo room (and by data saved in
// localStorage before accounts existed). Real accounts use their user id.
export type PartnerId = "partnerA" | "partnerB";

// Anyone who can add or rate movies: a user id when signed in, or "partnerA" /
// "partnerB" in the local demo room.
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
