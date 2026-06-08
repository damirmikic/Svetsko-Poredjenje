# PS3838 Read-Only API Integration Plan

This plan is for integrating the real PS3838 API as a read-only odds feed. Bet placement is intentionally out of scope.

## Goals

- Replace the current browser-facing Pinnacle feed with authenticated PS3838 API data.
- Keep the existing frontend table and normalized `pinnacle` bookmaker shape working.
- Keep credentials server-side only.
- Use PS3838 data for fixtures, odds, and the existing `Pinnacle no-vig` reference column.
- Respect PS3838 fair-use limits with server-side caching and delta polling.

## Out Of Scope

- Placing bets through the API.
- Calling `/line` in a loop.
- Balance, bet history, bet status, or account workflows.
- Any automated wagering logic.

## Required Environment Variables

```env
PS3838_ENABLED=false
PS3838_API_BASE=https://api.ps3838.com
PS3838_USERNAME=
PS3838_PASSWORD=
PS3838_SPORT_ID=29
PS3838_LEAGUE_IDS=
PS3838_ODDS_FORMAT=Decimal
PS3838_IS_LIVE=false
FEED_TIMEOUT_MS=8000
```

Optional cache controls:

```env
PS3838_CACHE_MS=30000
PS3838_SNAPSHOT_MS=60000
PS3838_DELTA_MS=5000
```

Notes:

- `PS3838_USERNAME` and `PS3838_PASSWORD` must never be exposed to browser code.
- `PS3838_SPORT_ID=29` is soccer.
- `PS3838_LEAGUE_IDS` should be a comma-separated list once the World Cup league IDs are known.
- Leave `PS3838_ENABLED=false` until credentials and league IDs are confirmed.

## API Endpoints

Use only read-only Lines API endpoints:

- `GET /v3/sports`
- `GET /v3/leagues?sportId=29`
- `GET /v3/fixtures?sportId=29&leagueIds=...`
- `GET /v4/odds?sportId=29&leagueIds=...&oddsFormat=Decimal`

Potential fallback if `/v4/odds` is not available for the account:

- `GET /v3/odds?sportId=29&leagueIds=...&oddsFormat=Decimal`

## Authentication

PS3838 uses HTTP Basic auth:

```text
Authorization: Basic base64(username:password)
Accept: application/json
User-Agent: sp-kvote/0.1
```

POST headers are not needed for the read-only feed.

## Data Flow

1. Load env config in `server.js`.
2. If `PS3838_ENABLED` is not true, keep current feed behavior.
3. If enabled but credentials are missing, return a configured/error feed status without making a request.
4. Fetch fixtures snapshot from `/v3/fixtures`.
5. Fetch odds snapshot from `/v4/odds`.
6. Join fixtures and odds by event ID.
7. Normalize into the existing app match shape:
   - `bookmakerId: "pinnacle"`
   - `bookmakerName: "Pinnacle"`
   - `source: "ps3838"`
   - `externalId`
   - `home`
   - `away`
   - `leagueName`
   - `leagueGroup`
   - `kickOffTime`
   - `odds.home`
   - `odds.draw`
   - `odds.away`
   - `totals25.over`
   - `totals25.under`
8. Let existing merge logic generate `pinnacle_shin`.

## Normalization Details

Fixtures response shape is league-based:

- `leagues[]`
- `league.id`
- `league.name`
- `league.events[]`
- `event.id`
- `event.starts`
- `event.home`
- `event.away`
- `event.status`
- `event.liveStatus`

Odds response also contains leagues and events:

- `league.events[]`
- `event.id`
- `event.periods[]`
- full match period usually has `number: 0`
- `period.moneyline.home`
- `period.moneyline.draw`
- `period.moneyline.away`
- `period.totals[]`
- totals item with `points: 2.5`
- `total.over`
- `total.under`

Only include events that:

- Belong to the configured World Cup league IDs, or match World Cup text filters during discovery.
- Are not settled/cancelled.
- Are pre-match when `PS3838_IS_LIVE=false`.
- Have enough team and kickoff data to create a stable `matchKey`.

## Cache And Delta Strategy

Start simple:

1. Snapshot fixtures and odds.
2. Cache the normalized result for `PS3838_CACHE_MS`.
3. Do not call PS3838 on every frontend refresh if cache is fresh.

Then improve:

1. Store `last` from fixtures and odds responses.
2. First call is a snapshot with no `since`.
3. Later calls use `since=<previous last>`.
4. Merge delta fixtures and odds into an in-memory state map keyed by event ID.
5. Refresh snapshots at least every `PS3838_SNAPSHOT_MS` to recover from missed state.

Fair-use guardrails:

- Snapshot `/fixtures` and `/odds`: at most once every 60 seconds per sport.
- Delta `/fixtures` and `/odds`: at most once every 5 seconds per sport.
- `/sports` and `/leagues`: at most once every 60 seconds.

## Implementation Phases

### Phase 1: Config And Client

- Add PS3838 env variables to `.env.example`.
- Add config constants to `server.js`.
- Add `ps3838Url`, `ps3838Headers`, `fetchPs3838Json`.
- Add credential masking in feed status URLs.

### Phase 2: Discovery

- Add a temporary/local-only way to inspect `/v3/leagues?sportId=29`.
- Identify the World Cup 2026 league IDs.
- Put confirmed IDs into `.env` and Netlify env variables.

### Phase 3: Snapshot Odds Feed

- Fetch `/v3/fixtures`.
- Fetch `/v4/odds`.
- Join by event ID.
- Normalize PS3838 events into the existing `pinnacle` shape.
- Keep the current browser-facing Pinnacle feed as fallback while testing.

### Phase 4: Cache

- Add in-memory cache around PS3838 fetches.
- Ensure `/api/odds` can refresh every 30 seconds without violating PS3838 snapshot limits.
- Return clear feed status when cached data is used after a temporary fetch error.

### Phase 5: Delta Updates

- Store `last` values.
- Add delta requests with `since`.
- Merge changed periods/events into cached state.
- Periodically force a clean snapshot.

### Phase 6: Production Cutover

- Set `PS3838_ENABLED=true`.
- Disable browser fallback in production.
- Confirm Netlify env vars.
- Confirm `/api/odds` returns real PS3838 data.
- Confirm `pinnacle_shin` no-vig still works.

## Verification Checklist

- `npm run build` passes.
- `/api/health` returns ok.
- `/api/odds` returns `pinnacle` feed status `ok`.
- No PS3838 credentials appear in browser network responses.
- Feed status URLs do not expose credentials.
- World Cup matches have stable `matchKey` values.
- 1X2 odds appear for Pinnacle.
- 2.5 totals appear where PS3838 offers them.
- `Pinnacle no-vig` column is populated from PS3838 odds.

## Risks

- PS3838 account may not have API permission even with valid login.
- World Cup league IDs may not exist until markets are offered.
- `/v4/odds` availability may depend on account/API rollout; fallback to `/v3/odds` may be needed.
- Delta merging can leave stale data if not periodically refreshed by snapshot.
- Netlify function cold starts may lose in-memory cache, so the code must still behave safely after cache reset.

