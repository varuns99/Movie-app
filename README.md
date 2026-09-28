# Movie Night Roulette

A mobile-first shared watchlist for two people who want movie night to start before the snacks are gone.

## Features

- Local couple room with editable partner names
- Shared watchlist stored in `localStorage`
- Demo mode with seeded movies, posters, moods, and YouTube trailer embeds
- Optional movie search (via TheTVDB) through a server-side proxy so the API key is not exposed in the browser
- Roulette picker with max runtime, genre, mood, and unwatched filters
- Separate partner ratings and private notes after watching
- Couple taste profile based only on local ratings
- Watched history with dates, added-by info, and both ratings

The app intentionally does not include IMDb ratings, Rotten Tomatoes scores, critic reviews, or scraped third-party review data.

## Run Locally

```bash
pnpm install
pnpm dev
```

Then open the local URL printed by Vite.

## Optional Private Movie Search Setup (TheTVDB)

GitHub Pages is a static host, so it cannot keep API keys private by itself. This app calls a small Cloudflare Worker proxy instead. The browser receives only the proxy URL; the TVDB API key stays in Cloudflare as a secret.

### 1. Get a TVDB API key

Create a free account at [thetvdb.com](https://thetvdb.com) and generate an API key from the [API Keys dashboard](https://thetvdb.com/dashboard/account/apikey). A standard key does not need a PIN.

### 2. Deploy the Worker

The proxy code is in `worker/tvdb-proxy.js`, with config in `worker/wrangler.toml`.

From the `worker` folder, deploy it with Cloudflare Wrangler:

```bash
pnpm movie:secret
pnpm movie:deploy
```

Paste your TVDB API key when Wrangler asks for it. Do not put the key in the React app, GitHub Pages, or any `VITE_` variable.

### 3. Add the Worker URL to GitHub

In the GitHub repository, add a repository variable:

```text
VITE_MOVIE_PROXY_URL=https://your-worker-name.your-subdomain.workers.dev
```

The GitHub Pages workflow passes that public URL into the Vite build. If this variable is missing, the app stays in demo mode.

### 4. Local Development

Create a `.env.local` file:

```bash
VITE_MOVIE_PROXY_URL=https://your-worker-name.your-subdomain.workers.dev
```

Restart the dev server after adding the proxy URL.

## TVDB Attribution

When TVDB search is connected, the app displays a required attribution link to TheTVDB.com in the footer, and notes that the product is not endorsed or certified by TheTVDB.

## Switching Movie Data Providers

The app talks to whatever server sits behind `VITE_MOVIE_PROXY_URL` through one generic `/search?query=` contract (see `src/movieSearch.ts`), so swapping providers later (e.g. back to TMDb) only means writing a new Worker file that returns the same response shape — the React app and its types do not need to change.

## Build

```bash
pnpm build
```
