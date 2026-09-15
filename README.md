# Movie Night Roulette

A mobile-first shared watchlist for two people who want movie night to start before the snacks are gone.

## Features

- Local couple room with editable partner names
- Shared watchlist stored in `localStorage`
- Demo mode with seeded movies, posters, moods, and YouTube trailer embeds
- Optional TMDb search through a server-side proxy so the TMDb key is not exposed in the browser
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

## Optional Private TMDb Setup

GitHub Pages is a static host, so it cannot keep API keys private by itself. This app calls a small Cloudflare Worker proxy instead. The browser receives only the proxy URL; the TMDb key stays in Cloudflare as a secret.

### 1. Deploy the Worker

The proxy code is in `worker/tmdb-proxy.js`, with config in `worker/wrangler.toml`.

From the `worker` folder, deploy it with Cloudflare Wrangler:

```bash
pnpm tmdb:secret
pnpm tmdb:deploy
```

Paste your TMDb API key when Wrangler asks for it. Do not put the key in the React app, GitHub Pages, or any `VITE_` variable.

### 2. Add the Worker URL to GitHub

In the GitHub repository, add a repository variable:

```text
VITE_TMDB_PROXY_URL=https://your-worker-name.your-subdomain.workers.dev
```

The GitHub Pages workflow passes that public URL into the Vite build. If this variable is missing, the app stays in demo mode.

### 3. Local Development

Create a `.env.local` file:

```bash
VITE_TMDB_PROXY_URL=https://your-worker-name.your-subdomain.workers.dev
```

Restart the dev server after adding the proxy URL.

## TMDb Attribution

When TMDb search is connected, the app displays the required notice: this product uses the TMDB API but is not endorsed or certified by TMDB.

## Build

```bash
pnpm build
```
