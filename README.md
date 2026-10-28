# Two Seats (formerly Movie Night Roulette)

A mobile-first shared watchlist for two people who want movie night to start before the snacks are gone.

## Features

- Local couple room with editable partner names
- Shared watchlist stored in `localStorage`
- Demo mode with seeded movies, posters, moods, and YouTube trailer embeds
- Optional movie search (via TheTVDB) through a server-side proxy so the API key is not exposed in the browser
- Learned autocomplete that remembers successful titles and alternate names, then surfaces partial matches immediately
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

When TVDB search is connected, the app displays a required attribution link to TheTVDB.com at the bottom of the Profile page, and notes that the product is not endorsed or certified by TheTVDB.

## Movies and Series

The watchlist holds movies and series. A series is one item (you add it, rate it as a whole, and mark it "finished"); seasons and episodes are not tracked. The Cloudflare Worker serves both from TheTVDB:

- `/search?query=&kind=movie|series|any` (movies by default), `/movie?id=` and `/series?id=` for details, and `/discover?kind=movie|series` for browsing.
- The watchlist table in Supabase needs three extra columns (`kind`, `seasons`, `series_status`). They are in the "Series support" part of `supabase/schema.sql`; run that part once in the Supabase SQL Editor (it is safe to run again). The app still works for films before it is run, but a series cannot be saved until it has been.

## Switching Movie Data Providers

The app talks to whatever server sits behind `VITE_MOVIE_PROXY_URL` through one generic `/search?query=&kind=` contract (see `src/movieSearch.ts`) plus `/movie`, `/series` and `/discover`, so swapping providers later (e.g. back to TMDb) only means writing a new Worker file that returns the same response shape — the React app and its types do not need to change.

## Build

```bash
pnpm build
```

## Installing the app

The site is an installable web app (a Progressive Web App). On Android Chrome, open the site and tap the **Install app** button at the bottom of the page, or Chrome's menu, then **Install app**. On iPhone, open it in Safari, tap Share, then **Add to Home Screen**. Once installed it opens full screen with its own icon, and the app's own screens open even with a poor connection (movie data and accounts still need the network).

Files: `public/manifest.webmanifest` (name, colours, icons; the app name appears here too), `public/sw.js` (the service worker, which only saves the app's own files), `public/icons/` (the icons) and `src/useInstallPrompt.ts` (the Install app button). The service worker is registered only in the built site (`src/main.tsx`), not during `pnpm dev`. To change what it saves, edit `public/sw.js` and bump `VERSION` at its top.
