// A YouTube video id is 11 characters. TVDB (and anything typed by hand) holds
// all sorts of link shapes, including broken ones like ".../embed/?v=ID" or
// "watch?v=?v=ID", so the id is picked out of the link rather than trusting its shape.
const YOUTUBE_ID = /(?:[?&]v=|\/embed\/|youtu\.be\/|\/shorts\/|\/live\/)([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])/;

// Any YouTube link to the plain embed form, or undefined if it is not a usable YouTube link.
export const normalizeTrailerUrl = (url?: string | null): string | undefined => {
  if (!url) return undefined;
  try {
    const host = new URL(url).hostname;
    if (!host.includes("youtube.com") && !host.includes("youtu.be")) return undefined;
  } catch {
    return undefined;
  }
  const id = url.match(YOUTUBE_ID)?.[1];
  return id ? `https://www.youtube.com/embed/${id}` : undefined;
};
