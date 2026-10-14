import type { Mood, MovieCandidate } from "./types";

export const moods: Mood[] = [
  "cozy",
  "funny",
  "romantic",
  "tense",
  "scary",
  "weird",
  "low-effort",
];

// Offline sample catalog: used for search and discovery when the live movie
// service is not configured.
export const demoCandidates: MovieCandidate[] = [
  {
    source: "demo",
    language: "eng",
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
    language: "eng",
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
    language: "jpn",
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
    language: "eng",
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
    language: "eng",
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
    language: "eng",
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
    language: "eng",
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
    language: "eng",
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
    language: "eng",
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
    language: "eng",
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
