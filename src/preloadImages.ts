// Fetches images ahead of time so they are already there when shown. Resolves when
// all have loaded (or failed), or after `timeoutMs`, whichever comes first.
export const preloadImages = (urls: (string | undefined)[], timeoutMs = 3000) =>
  new Promise<void>((resolve) => {
    const pending = [...new Set(urls.filter((url): url is string => Boolean(url)))];
    if (!pending.length) {
      resolve();
      return;
    }
    let left = pending.length;
    const timer = window.setTimeout(resolve, timeoutMs);
    pending.forEach((url) => {
      const image = new Image();
      image.onload = image.onerror = () => {
        left -= 1;
        if (left === 0) {
          window.clearTimeout(timer);
          resolve();
        }
      };
      image.src = url;
    });
  });

// The posters a roulette carousel shows before anyone spins: the first one in the
// middle and up to five on each side (the list wraps round).
export const postersInView = (items: { posterUrl: string }[]) =>
  items.length <= 11 ? items.map((item) => item.posterUrl) : [...items.slice(0, 6), ...items.slice(-5)].map((item) => item.posterUrl);
