# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Fudbal Kvote — a dashboard comparing football odds across Serbian/regional sportsbooks (OddsPortal-style),
with Pinnacle no-vig (Shin method) as the value-detection reference. UI text and docs are in Serbian.

## Commands

```bash
npm install
npm run dev          # starts the standalone Node HTTP server (server.js) on :3000
PORT=3001 npm run dev # if 3000 is taken

npm run check         # node --check syntax validation across server.js, public/*, netlify/*
npm test              # node --test "test/*.test.js"
npm run build          # check + test (this is what Netlify runs)

node --test test/teams.test.js       # run a single test file
node --test test/aggregate.test.js
node --test test/cache.test.js
```

No build step/bundler/transpiler — this is plain ESM JS served directly (`"type": "module"` in package.json).

## Architecture

### Dual runtime: standalone server + Netlify Functions

`server.js` is the entire backend and is designed to run two ways from the same source:

- **Standalone**: the `if (process.argv[1] === ... server.js)` guard at the bottom of the file starts a
  `node:http` server that serves `/api/odds`, `/api/health`, and static files from `public/`.
- **Netlify**: `netlify/functions/odds.js` and `netlify/functions/health.js` import `getOddsPayload` /
  `getHealthPayload` directly from `server.js` and wrap them as serverless handlers. `netlify.toml`
  rewrites `/api/odds` and `/api/health` to these functions.

Because of this, exported functions in `server.js` (`getOddsPayload`, `fetchBookmaker`, `aggregateMatches`,
`normalizeCompetitionName`, `clearFeedCache`, `getHealthPayload`) must stay side-effect-free at import time
and safe to call from either entrypoint.

### Data flow

1. **Fetch**: for each bookmaker feed (Pinnacle, MerkurXtip, MaxBet, SoccerBet, Mozzart, Superbet,
   BalkanBet, BetInAsia/Oddsmath, Betfair Lay), `fetchBookmaker` pulls raw odds per competition. Each
   feed's competition mapping (league codes/tournament IDs/date ranges) lives in the `COMPETITIONS` array
   near the top of `server.js` — adding a competition means adding an entry there with the right IDs for
   every feed type that supports it.
2. **Cache**: results are cached per-feed per-competition for 60s, with in-flight request coalescing so
   concurrent callers share one upstream HTTP call. `clearFeedCache()` resets this (used in tests).
3. **Aggregate/join**: `aggregateMatches` merges offers from all feeds into rows keyed by match. Pinnacle
   is `sourceOfTruth` for the fixture list and team-name spelling; when Pinnacle is unavailable it falls
   back to BetInAsia (Oddsmath). Offers that can't be confidently matched to a fixture land in `unmatched`
   instead of being silently dropped or mis-joined.
4. **Serve**: `getOddsPayload(competitionId)` returns `{ matches, feeds, unmatched, opportunities, filter }`
   consumed by `public/app.js`.

### Team-name matching (`public/shared/teams.js` + `team-aliases.js`)

Shared between server and browser (same file imported by both — keep it environment-agnostic, no Node-only
or DOM-only APIs). Matching is layered:

1. `canonicalizeTeam` — lowercase, strip diacritics/punctuation.
2. `TEAM_ALIASES` (from `team-aliases.js`) — manual exonym/alias table.
3. `teamTokens` — strips club prefixes (`FC`, `AFC`, `VfB`, year suffixes) and expands abbreviations
   (`utd`→`united`, `man`→`manchester`, `spurs`→`tottenham`).
4. `teamSimilarity` — fuzzy Jaccard comparison for whatever remains.

A match is only joined when **both** teams clear the `0.72` similarity threshold, and is rejected if two
candidate matches are within `0.08` of each other (ambiguous). **When an unrecognized team name shows up
in the "Neuparene" (unmatched) tab, the fix is almost always adding an alias to
`public/shared/team-aliases.js` — that is the one file meant to be edited for this; don't touch the
matching logic in `teams.js` for a naming issue.**

### Odds/value logic

- The "Pinnacle no-vig" column is Pinnacle's odds with margin removed via the **Shin method**. It's a
  reference for coloring value bets, not a real bookmaker — it doesn't participate in "best odds" or
  margin calculations for the comparison table.
  - Goals (over/under) comparisons always follow whatever line (2.5, fallback 3.5) Pinnacle quotes for
  that specific match; other bookmakers are compared only on that same line.

### Frontend (`public/`)

Vanilla JS, no framework/build step. `app.js` handles rendering, tab switching (1X2, Danasnji mecevi,
Golovi, Ide dalje, Mnozenje kvota, Neuparene), state, and polls for odds-change notifications (30s
snapshot interval, configurable threshold, default 3%).

### Config

Environment variables (see `.env.example`) configure feed URLs, timeouts, and the optional direct PS3838
(Pinnacle) API integration (`PS3838_ENABLED`, credentials, caching intervals). Local secrets go in `.env`
(gitignored); never commit real credentials there.
