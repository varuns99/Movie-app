// Anyone who can add or rate movies: their account (user) id.
export type MemberId = string;

export type Member = {
  id: MemberId;
  displayName: string;
};

export type WatchStatus = "unwatched" | "watched";

// What a watchlist item is. A series is one item (no seasons or episodes tracked).
// TVDB numbers movies and series separately, so an id only means something with its kind.
export type TitleKind = "movie" | "series";

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
  kind: TitleKind;
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
  // IMDb title id ("tt0066461"), used only to link to the film's IMDb page.
  imdbId?: string;
  // Series only: number of regular seasons, and TVDB's status ("Continuing", "Ended", "Upcoming").
  seasons?: number;
  seriesStatus?: string;
  addedBy: MemberId;
  addedAt: string;
  status: WatchStatus;
  watchedAt?: string;
  ratings: Partial<Record<MemberId, Rating>>;
};

export type MovieCandidate = {
  source: "demo" | "tvdb" | "manual";
  // Missing means a movie (older saved suggestions and manual picks have no kind).
  kind?: TitleKind;
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
  // Series only: see Movie.
  seasons?: number;
  seriesStatus?: string;
  // True when the film is not out yet; `releaseDate` ("2027-11-05") is its earliest date still ahead.
  upcoming?: boolean;
  releaseDate?: string;
  // Language ("eng") of the chosen trailer, when TVDB says.
  trailerLanguage?: string;
  // Original language as a three-letter code ("eng", "jpn"); used by discovery filters.
  language?: string;
  englishTitle?: string;
  imdbId?: string;
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
