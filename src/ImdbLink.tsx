// A small text link to the film's page on IMDb. IMDb cannot be shown inside our
// own windows (it refuses to load framed), so it opens in a new tab. Text only:
// IMDb's logo is not ours to use.
const IMDB_ID = /^tt\d{6,10}$/;

export function ImdbLink({ imdbId }: { imdbId?: string }) {
  if (!imdbId || !IMDB_ID.test(imdbId)) return null;
  return (
    <a
      className="imdb-link"
      href={`https://www.imdb.com/title/${imdbId}/`}
      target="_blank"
      rel="noopener noreferrer"
    >
      View on IMDb
    </a>
  );
}
