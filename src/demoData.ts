import type { AppState, Mood, Movie, MovieCandidate, PartnerId, Room } from "./types";

export const moods: Mood[] = [
  "cozy",
  "funny",
  "romantic",
  "tense",
  "scary",
  "weird",
  "low-effort",
];

const now = new Date();
const daysAgo = (days: number) => new Date(now.getTime() - days * 86400000).toISOString();

export const defaultRoom: Room = {
  id: "room-demo-velvet",
  name: "The Velvet Couch Club",
  partnerA: "Mira",
  partnerB: "Noah",
  createdAt: daysAgo(14),
};

export const demoCandidates: MovieCandidate[] = [
  {
    source: "demo",
    title: "Inception",
    year: "2010",
    runtime: 148,
    genres: ["Sci-Fi", "Thriller", "Action"],
    moods: ["tense", "weird"],
    synopsis:
      "A skilled thief enters dreams to steal secrets, then takes one last job that asks him to plant an idea instead.",
    posterUrl: "https://image.tmdb.org/t/p/w500/oYuLEt3zVCKq57qu2F8dT7NIa6f.jpg",
    trailerUrl: "https://www.youtube.com/embed/YoHD9XEInc0",
  },
  {
    source: "demo",
    title: "Arrival",
    year: "2016",
    runtime: 116,
    genres: ["Drama", "Sci-Fi", "Mystery"],
    moods: ["tense", "weird", "low-effort"],
    synopsis:
      "A linguist works to understand mysterious visitors before fear turns a first contact into a global crisis.",
    posterUrl: "https://image.tmdb.org/t/p/w500/x2FJsf1ElAgr63Y3PNPtJrcmpoe.jpg",
    trailerUrl: "https://www.youtube.com/embed/tFMo3UJ4B4g",
  },
  {
    source: "demo",
    title: "Spirited Away",
    year: "2001",
    runtime: 125,
    genres: ["Animation", "Fantasy", "Family"],
    moods: ["cozy", "weird"],
    synopsis:
      "A young girl wanders into a spirit world and has to find her courage in a bathhouse full of strange magic.",
    posterUrl: "https://image.tmdb.org/t/p/w500/39wmItIWsg5sZMyRUHLkWBcuVCM.jpg",
    trailerUrl: "https://www.youtube.com/embed/ByXuk9QqQkk",
  },
  {
    source: "demo",
    title: "Palm Springs",
    year: "2020",
    runtime: 90,
    genres: ["Comedy", "Romance", "Sci-Fi"],
    moods: ["funny", "romantic", "low-effort"],
    synopsis:
      "Two wedding guests get trapped in the same day and begin testing what a relationship means when tomorrow refuses to arrive.",
    posterUrl: "https://image.tmdb.org/t/p/w500/yf5IuMW6GHghu39kxA0oFx7Bxmj.jpg",
    trailerUrl: "https://www.youtube.com/embed/CpBLtXduh_k",
  },
  {
    source: "demo",
    title: "Knives Out",
    year: "2019",
    runtime: 131,
    genres: ["Mystery", "Comedy", "Crime"],
    moods: ["funny", "cozy", "tense"],
    synopsis:
      "A detective untangles a famous writer's suspicious death while the family gathers with secrets, money, and sharp sweaters.",
    posterUrl: "https://image.tmdb.org/t/p/w500/pThyQovXQrw2m0s9x82twj48Jq4.jpg",
    trailerUrl: "https://www.youtube.com/embed/qGqiHJTsRkQ",
  },
  {
    source: "demo",
    title: "About Time",
    year: "2013",
    runtime: 123,
    genres: ["Romance", "Drama", "Comedy"],
    moods: ["romantic", "cozy"],
    synopsis:
      "A man discovers he can travel through his own life and slowly learns which ordinary moments are worth keeping.",
    posterUrl: "https://image.tmdb.org/t/p/w500/iR1bVfURbN7r1C46WHFbwCkVve.jpg",
    trailerUrl: "https://www.youtube.com/embed/T7A810duHvw",
  },
  {
    source: "demo",
    title: "Mad Max: Fury Road",
    year: "2015",
    runtime: 121,
    genres: ["Action", "Adventure", "Sci-Fi"],
    moods: ["tense", "weird"],
    synopsis:
      "Across a brutal desert, rebels and survivors turn a chase into a thunderous escape toward something like freedom.",
    posterUrl: "https://image.tmdb.org/t/p/w500/hA2ple9q4qnwxp3hKVNhroipsir.jpg",
    trailerUrl: "https://www.youtube.com/embed/hEJnMQG9ev8",
  },
  {
    source: "demo",
    title: "The Grand Budapest Hotel",
    year: "2014",
    runtime: 100,
    genres: ["Comedy", "Adventure", "Drama"],
    moods: ["funny", "cozy", "weird"],
    synopsis:
      "A devoted concierge and his lobby boy tumble through theft, romance, pastries, and a changing Europe.",
    posterUrl: "https://image.tmdb.org/t/p/w500/eWdyYQreja6JGCzqHWXpWHDrrPo.jpg",
    trailerUrl: "https://www.youtube.com/embed/1Fg5iWmQjwk",
  },
  {
    source: "demo",
    title: "Get Out",
    year: "2017",
    runtime: 104,
    genres: ["Horror", "Mystery", "Thriller"],
    moods: ["scary", "tense", "weird"],
    synopsis:
      "A weekend visit turns deeply unsettling as a man notices that something is wrong beneath the perfect welcome.",
    posterUrl: "https://image.tmdb.org/t/p/w500/tFXcEccSQMf3lfhfXKSU9iRBpa3.jpg",
    trailerUrl: "https://www.youtube.com/embed/DzfpyUB60YY",
  },
  {
    source: "demo",
    title: "Everything Everywhere All at Once",
    year: "2022",
    runtime: 140,
    genres: ["Action", "Comedy", "Sci-Fi"],
    moods: ["weird", "funny", "romantic"],
    synopsis:
      "An exhausted laundromat owner is pulled into a multiverse adventure where family, taxes, and tenderness collide.",
    posterUrl: "https://image.tmdb.org/t/p/w500/w3LxiVYdWWRvEVdn5RYq6jIqkb1.jpg",
    trailerUrl: "https://www.youtube.com/embed/wxN1T1uxQ2g",
  },
];

const seedMovie = (
  candidate: MovieCandidate,
  index: number,
  addedBy: PartnerId,
  watched?: { watchedAt: string; a: number; b: number; noteA: string; noteB: string },
): Movie => ({
  ...candidate,
  id: `demo-${index}-${candidate.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
  addedBy,
  addedAt: daysAgo(12 - index),
  status: watched ? "watched" : "unwatched",
  watchedAt: watched?.watchedAt,
  ratings: watched
    ? {
        partnerA: { score: watched.a, note: watched.noteA, ratedAt: watched.watchedAt },
        partnerB: { score: watched.b, note: watched.noteB, ratedAt: watched.watchedAt },
      }
    : {},
});

export const createDemoState = (): AppState => ({
  room: defaultRoom,
  movies: [
    seedMovie(demoCandidates[0], 0, "partnerA", {
      watchedAt: daysAgo(8),
      a: 4,
      b: 5,
      noteA: "Twisty in the good way. Needed snacks for the last act.",
      noteB: "Still fun even when I pretend I understand all of it.",
    }),
    seedMovie(demoCandidates[5], 5, "partnerB", {
      watchedAt: daysAgo(5),
      a: 5,
      b: 4,
      noteA: "Soft without being mushy.",
      noteB: "A very strong blanket movie.",
    }),
    seedMovie(demoCandidates[8], 8, "partnerA", {
      watchedAt: daysAgo(2),
      a: 4,
      b: 3,
      noteA: "Brilliant, but maybe not right before sleep.",
      noteB: "Great. Also absolutely not low-effort.",
    }),
    seedMovie(demoCandidates[1], 1, "partnerB"),
    seedMovie(demoCandidates[2], 2, "partnerA"),
    seedMovie(demoCandidates[3], 3, "partnerB"),
    seedMovie(demoCandidates[4], 4, "partnerA"),
    seedMovie(demoCandidates[6], 6, "partnerB"),
    seedMovie(demoCandidates[7], 7, "partnerA"),
    seedMovie(demoCandidates[9], 9, "partnerB"),
  ],
});
