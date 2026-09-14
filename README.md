# Movie Night Roulette

A mobile-first shared watchlist for two people who want movie night to start before the snacks are gone.

## Features

- Local couple room with editable partner names
- Shared watchlist stored in `localStorage`
- Demo mode with seeded movies, posters, moods, and YouTube trailer embeds
- Optional TMDb search through `VITE_TMDB_API_KEY`
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

## Optional TMDb Setup

Create a `.env.local` file:

```bash
VITE_TMDB_API_KEY=your_tmdb_api_key_here
```

Restart the dev server after adding the key. If the key is missing or TMDb requests fail, the app continues to work in demo mode.

## Build

```bash
pnpm build
```
