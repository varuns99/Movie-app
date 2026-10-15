import type { MovieCandidate } from "./types";

export const thisYear = () => new Date().getFullYear();
export const today = () => new Date().toISOString().slice(0, 10);

// "Not out yet", for a film the movie service has described. Without a status
// from it, a film is upcoming when its release date or its year is still ahead.
export const isUpcomingCandidate = (movie: Pick<MovieCandidate, "upcoming" | "releaseDate" | "year">) => {
  if (Number(movie.year) > thisYear()) return true; // Cannot be out yet, whatever the service says.
  if (typeof movie.upcoming === "boolean") return movie.upcoming;
  if (movie.releaseDate) return movie.releaseDate > today();
  return Number(movie.year) > thisYear();
};

// "Nov 2027" for a date, "2027" for a year only.
export const releaseLabel = (releaseDate: string | undefined, year: string) => {
  if (releaseDate) {
    const parsed = new Date(`${releaseDate}T00:00:00`);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toLocaleDateString(undefined, { month: "short", year: "numeric" });
    }
  }
  return year;
};
