import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const projectDir = process.cwd();
const publicDir = join(projectDir, "public");

loadLocalEnv();

const PORT = Number(process.env.PORT || 3000);
const DUALSOFT_VERSION = process.env.DUALSOFT_VERSION || "2.44.3.18";
const LOCALE = "sr";
const FEED_TIMEOUT_MS = Number(process.env.FEED_TIMEOUT_MS || 4000);
const ODDS_API_BASE = process.env.ODDS_API_BASE || "https://api.odds-api.io/v3";
const ODDS_API_KEY = process.env.ODDS_API_KEY || "";
const ODDS_API_SPORT = process.env.ODDS_API_SPORT || "football";
const ODDS_API_WORLD_CUP_LEAGUE = process.env.ODDS_API_WORLD_CUP_LEAGUE || "international-world-cup";
const ODDS_API_BOOKMAKERS = "Orbit Exchange";
const PINNACLE_API_BASE =
  process.env.PINNACLE_API_BASE || "https://www.pinnacle888.com/sports-service/sv/euro";
const PINNACLE_SPORT_ID = Number(process.env.PINNACLE_SPORT_ID || 29);
const PINNACLE_LOCALE = process.env.PINNACLE_LOCALE || "en_US";
const PINNACLE_LEAGUE_IDS = String(process.env.PINNACLE_LEAGUE_IDS || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const PINNACLE_ODDS_TYPE = process.env.PINNACLE_ODDS_TYPE || "1";
const PINNACLE_VERSION = process.env.PINNACLE_VERSION || "0";
const PINNACLE_SPECIAL_VERSION = process.env.PINNACLE_SPECIAL_VERSION || "0";
const PINNACLE_LEAGUE_CODE = process.env.PINNACLE_LEAGUE_CODE || "fifa-world-cup";
const PINNACLE_USE_LEAGUES_LOOKUP = process.env.PINNACLE_USE_LEAGUES_LOOKUP === "true";
const PINNACLE_PERIOD_NUM = process.env.PINNACLE_PERIOD_NUM || "-1";
const PINNACLE_EVENT_TYPE = process.env.PINNACLE_EVENT_TYPE || "0";
const PS3838_ENABLED = process.env.PS3838_ENABLED === "true";
const PS3838_API_BASE = process.env.PS3838_API_BASE || "https://api.ps3838.com";
const PS3838_USERNAME = process.env.PS3838_USERNAME || "";
const PS3838_PASSWORD = process.env.PS3838_PASSWORD || "";
const PS3838_SPORT_ID = Number(process.env.PS3838_SPORT_ID || 29);
const PS3838_LEAGUE_IDS = String(process.env.PS3838_LEAGUE_IDS || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const PS3838_ODDS_FORMAT = process.env.PS3838_ODDS_FORMAT || "Decimal";
const PS3838_IS_LIVE = process.env.PS3838_IS_LIVE === "true";
const PS3838_CACHE_MS = Number(process.env.PS3838_CACHE_MS || 30000);
const SUPERBET_WORLD_CUP_TOURNAMENTS = [
  "1431",
  "1432",
  "1433",
  "1434",
  "1435",
  "1436",
  "1437",
  "1438",
  "1439",
  "94891",
  "94892",
  "94893",
  "94894",
];

const WORLD_CUP_TERMS = [
  "world cup",
  "fifa world cup",
  "svetsko prvenstvo",
  "svetsko prvenstvo 2026",
  "mundial",
  "mundijal",
  "sp 2026",
  "wc 2026",
  "worldcup",
];

const WOMENS_COMPETITION_TERMS = [
  " women",
  " womens",
  " zene",
  " zenska",
  " zenski",
  " zensko",
  " w ",
];

const BOOKMAKERS = [
  {
    id: "oddsapi",
    name: "Odds-API.io",
    type: "oddsapi",
    baseUrl: ODDS_API_BASE,
    sourceOfTruth: true,
  },
  {
    id: "pinnacle",
    name: "Pinnacle",
    type: "pinnacle",
    baseUrl: PS3838_ENABLED ? PS3838_API_BASE : PINNACLE_API_BASE,
    sourceOfTruth: true,
  },
  {
    id: "merkurxtip",
    name: "MerkurXtip",
    type: "dualsoft",
    baseUrl: "https://dual-dev.merkurtip.rs",
  },
  {
    id: "maxbet",
    name: "MaxBet",
    type: "dualsoft",
    baseUrl: "https://www.maxbet.rs",
  },
  {
    id: "soccerbet",
    name: "SoccerBet",
    type: "dualsoft",
    baseUrl: "https://www.soccerbet.rs",
  },
  {
    id: "superbet",
    name: "Superbet",
    type: "superbet",
    baseUrl: "https://production-superbet-offer-rs.freetls.fastly.net/sb-rs/api/v3/subscription",
  },
  {
    id: "balkanbet",
    name: "BalkanBet",
    type: "nsoft",
    baseUrl: "https://sports-sm-distribution-api.de-2.nsoftcdn.com",
    companyUuid: "4f54c6aa-82a9-475d-bf0e-dc02ded89225",
    tournamentId: 30,
  },
];

const ODDS_API_DISPLAY_BOOKMAKERS = ODDS_API_BOOKMAKERS.split(",")
  .map((name) => name.trim())
  .filter(Boolean)
  .map((name) => ({
    id: oddsApiBookmakerId(name),
    name,
    type: "oddsapi-bookmaker",
    baseUrl: ODDS_API_BASE,
  }));

const PINNACLE_SHIN_BOOKMAKER = {
  id: "pinnacle_shin",
  name: "Pinnacle no-vig",
  type: "reference",
  baseUrl: PINNACLE_API_BASE,
  isReference: true,
};

const DISPLAY_BOOKMAKERS = [
  PINNACLE_SHIN_BOOKMAKER,
  ...BOOKMAKERS.filter((bookmaker) => bookmaker.id !== "oddsapi"),
];
const FEED_BOOKMAKERS = BOOKMAKERS.filter((bookmaker) => bookmaker.id !== "oddsapi");
const ps3838Cache = {
  expiresAt: 0,
  promise: null,
  result: null,
};

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function loadLocalEnv() {
  const envPath = join(projectDir, ".env");
  if (!existsSync(envPath)) return;

  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed
      .slice(separatorIndex + 1)
      .trim()
      .replace(/^["']|["']$/g, "");

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(body);
}

function sendText(res, status, text, contentType = "text/plain; charset=utf-8") {
  res.writeHead(status, { "content-type": contentType });
  res.end(text);
}

function dualsoftOfferUrl(baseUrl) {
  const params = new URLSearchParams({
    annex: "0",
    desktopVersion: DUALSOFT_VERSION,
    locale: LOCALE,
  });
  return `${baseUrl}/restapi/offer/${LOCALE}/sport/S/mob?${params.toString()}`;
}

function nsoftWorldCupUrl(bookmaker) {
  const params = new URLSearchParams({
    companyUuid: bookmaker.companyUuid,
    "filter[from]": "2026-06-07T00:00:00",
    "filter[to]": "2026-07-20T23:59:59",
    "filter[tournamentId]": String(bookmaker.tournamentId),
    timezone: "Europe/Belgrade",
    dataFormat: JSON.stringify({
      default: "object",
      events: "array",
      outcomes: "array",
    }),
    sort: "categoryPosition,categoryName,tournamentPosition,tournamentName,startsAt",
    offerTemplate: "WEB_OVERVIEW",
    shortProps: "1",
    deliveryPlatformId: "3",
    language: JSON.stringify({
      default: "sr-Latn",
      events: "sr-Latn",
      sport: "sr-Latn",
      category: "sr-Latn",
      tournament: "sr-Latn",
      team: "sr-Latn",
      market: "sr-Latn",
    }),
  });

  return `${bookmaker.baseUrl}/api/v1/events?${params.toString()}`;
}

function superbetWorldCupUrl(bookmaker) {
  const params = new URLSearchParams({
    sports: "5",
    tournaments: SUPERBET_WORLD_CUP_TOURNAMENTS.join(","),
    startDate: "2026-06-07T00:00:00.000Z",
    endDate: "2028-06-07T00:00:00.000Z",
  });

  return `${bookmaker.baseUrl}/sr-Latn-RS/prematch?${params.toString()}`;
}

function oddsApiUrl(pathname, params = {}) {
  const url = new URL(pathname, ODDS_API_BASE.endsWith("/") ? ODDS_API_BASE : `${ODDS_API_BASE}/`);
  const search = new URLSearchParams(params);
  if (ODDS_API_KEY) search.set("apiKey", ODDS_API_KEY);
  url.search = search.toString();
  return url.toString();
}

function maskApiKeyUrl(url) {
  const clean = new URL(url);
  if (clean.searchParams.has("apiKey")) clean.searchParams.set("apiKey", "***");
  return clean.toString();
}

function oddsApiEventsUrl() {
  return oddsApiUrl("events", {
    sport: ODDS_API_SPORT,
    league: ODDS_API_WORLD_CUP_LEAGUE,
    status: "pending,live",
  });
}

function oddsApiMultiOddsUrl(eventIds) {
  return oddsApiUrl("odds/multi", {
    eventIds: eventIds.join(","),
    bookmakers: ODDS_API_BOOKMAKERS,
  });
}

function chunkArray(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function oddsApiBookmakerId(name) {
  return `oddsapi_${String(name || "")
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")}`;
}

function pinnacleUrl(pathname, params = {}) {
  const url = new URL(pathname, PINNACLE_API_BASE.endsWith("/") ? PINNACLE_API_BASE : `${PINNACLE_API_BASE}/`);
  const search = new URLSearchParams(params);
  search.set("locale", PINNACLE_LOCALE);
  search.set("_", String(Date.now()));
  search.set("withCredentials", "true");

  if (PINNACLE_LEAGUE_IDS.length && !search.has("leagueIds")) {
    search.set("leagueIds", PINNACLE_LEAGUE_IDS.join(","));
  }

  url.search = search.toString();
  return url.toString();
}

function pinnacleLeaguesUrl() {
  return pinnacleUrl("leagues", { sportId: String(PINNACLE_SPORT_ID) });
}

function pinnacleLeagueOddsUrl(leagueCode = PINNACLE_LEAGUE_CODE) {
  return pinnacleUrl("odds/league", {
    sportId: String(PINNACLE_SPORT_ID),
    oddsType: PINNACLE_ODDS_TYPE,
    version: PINNACLE_VERSION,
    timeStamp: String(Date.now()),
    periodNum: PINNACLE_PERIOD_NUM,
    eSportCode: "",
    leagueCode,
    isHlE: "true",
    isLive: "false",
    eventType: PINNACLE_EVENT_TYPE,
  });
}

function ps3838Url(pathname, params = {}) {
  const url = new URL(pathname, PS3838_API_BASE.endsWith("/") ? PS3838_API_BASE : `${PS3838_API_BASE}/`);
  const search = new URLSearchParams(params);
  if (PS3838_LEAGUE_IDS.length && !search.has("leagueIds")) {
    search.set("leagueIds", PS3838_LEAGUE_IDS.join(","));
  }
  url.search = search.toString();
  return url.toString();
}

function ps3838FixturesUrl(extraParams = {}) {
  return ps3838Url("v3/fixtures", {
    sportId: String(PS3838_SPORT_ID),
    ...extraParams,
  });
}

function ps3838OddsUrl(version = "v4", extraParams = {}) {
  return ps3838Url(`${version}/odds`, {
    sportId: String(PS3838_SPORT_ID),
    oddsFormat: PS3838_ODDS_FORMAT,
    isLive: String(PS3838_IS_LIVE),
    ...extraParams,
  });
}

function ps3838LeaguesUrl() {
  return ps3838Url("v3/leagues", { sportId: String(PS3838_SPORT_ID) });
}

function ps3838Headers() {
  return {
    accept: "application/json",
    "user-agent": "sp-kvote/0.1",
    authorization: `Basic ${Buffer.from(`${PS3838_USERNAME}:${PS3838_PASSWORD}`).toString("base64")}`,
  };
}

function textIncludesWorldCup(value) {
  const haystack = String(value || "").toLocaleLowerCase("sr-RS");
  return WORLD_CUP_TERMS.some((term) => haystack.includes(term));
}

function textIncludesWomensCompetition(value) {
  const normalized = ` ${String(value || "")
    .toLocaleLowerCase("sr-RS")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()} `;

  return WOMENS_COMPETITION_TERMS.some((term) => normalized.includes(term));
}

function isWorldCupMatch(match) {
  const joined = [
    match.leagueName,
    match.leagueToken,
    match.leagueGroupToken,
    match.home,
    match.away,
  ].join(" ");

  return textIncludesWorldCup(joined) && !textIncludesWomensCompetition(joined);
}

function isOddsApiWorldCupEvent(event) {
  const joined = [
    event.league?.name,
    event.league?.slug,
    event.home,
    event.away,
  ].join(" ");

  return textIncludesWorldCup(joined) && !textIncludesWomensCompetition(joined);
}

function getDualsoftOdd(match, code) {
  if (match.odds && Number.isFinite(Number(match.odds[code]))) {
    return Number(match.odds[code]);
  }

  const mapValue = match.betMap?.[code];
  if (mapValue && typeof mapValue === "object") {
    const first = Object.values(mapValue)[0];
    if (first && Number.isFinite(Number(first.ov))) {
      return Number(first.ov);
    }
  }

  return null;
}

function emptyTotals25() {
  return { over: null, under: null };
}

function normalizePrice(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 1 ? Number(numeric.toFixed(3)) : null;
}

function lineIs25(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && Math.abs(numeric - 2.5) < 0.001;
}

function textLooksOver(value) {
  const text = String(value || "").toLocaleLowerCase("en-US");
  return /\bover\b|\bo\b|vise|preko|3\+/.test(text);
}

function textLooksUnder(value) {
  const text = String(value || "").toLocaleLowerCase("en-US");
  return /\bunder\b|\bu\b|manje|ispod|0-2/.test(text);
}

function totalLineFromObject(item) {
  return item?.points ?? item?.point ?? item?.line ?? item?.handicap ?? item?.total ?? item?.value ?? item?.p;
}

function priceFromObject(item) {
  return item?.price ?? item?.odds ?? item?.decimal ?? item?.value ?? item?.g ?? item?.ov;
}

function sidePriceFromObject(value) {
  return value && typeof value === "object" ? priceFromObject(value) : value;
}

function getOutcomeName(item) {
  return [item?.name, item?.label, item?.selection, item?.type, item?.side, item?.e, item?.metadata?.name]
    .filter(Boolean)
    .join(" ");
}

function totals25FromLines(lines) {
  const totals = emptyTotals25();
  if (!Array.isArray(lines)) return totals;

  for (const line of lines) {
    const lineValue = totalLineFromObject(line);
    const nestedOutcomes = line?.outcomes || line?.prices || line?.odds || line?.h;

    if (lineIs25(lineValue)) {
      totals.over ||= normalizePrice(sidePriceFromObject(line.over ?? line.overPrice ?? line.o));
      totals.under ||= normalizePrice(sidePriceFromObject(line.under ?? line.underPrice ?? line.u));
    }

    if (Array.isArray(nestedOutcomes)) {
      for (const outcome of nestedOutcomes) {
        const outcomeLine = totalLineFromObject(outcome) ?? lineValue;
        if (!lineIs25(outcomeLine)) continue;

        const name = getOutcomeName(outcome);
        const price = normalizePrice(priceFromObject(outcome));
        if (textLooksOver(name)) totals.over ||= price;
        if (textLooksUnder(name)) totals.under ||= price;
      }
    }
  }

  return totals;
}

function totals25FromLineObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return totals25FromLines(value);
  return totals25FromLines(
    Object.entries(value).map(([line, item]) =>
      item && typeof item === "object" ? { line, ...item } : { line, value: item },
    ),
  );
}

function mergeTotals25(...items) {
  return items.reduce((merged, item) => {
    merged.over ||= item?.over || null;
    merged.under ||= item?.under || null;
    return merged;
  }, emptyTotals25());
}

function normalizeDualsoftMatches(bookmaker, payload) {
  const matches = Array.isArray(payload?.esMatches) ? payload.esMatches : [];

  return matches.filter(isWorldCupMatch).map((match) => ({
    bookmakerId: bookmaker.id,
    bookmakerName: bookmaker.name,
    source: bookmaker.type,
    matchKey: createMatchKey(match.home, match.away, match.kickOffTime),
    externalId: match.id,
    matchCode: match.matchCode,
    home: normalizeTeamName(match.home),
    away: normalizeTeamName(match.away),
    leagueName: normalizeCompetitionName(match.leagueName),
    leagueGroup: match.leagueGroupToken || "",
    kickOffTime: Number(match.kickOffTime) || null,
    updatedAt: Number(match.tmstmp) || Date.now(),
    odds: {
      home: getDualsoftOdd(match, "1"),
      draw: getDualsoftOdd(match, "2"),
      away: getDualsoftOdd(match, "3"),
    },
    totals25: totals25FromLines(Object.values(match.betMap || {}).flatMap((item) => Object.values(item || {}))),
  }));
}

function getNsoftTeamNames(event) {
  const fromEventName = String(event.j || "")
    .split(" - ")
    .map((value) => value.trim())
    .filter(Boolean);

  if (fromEventName.length >= 2) {
    return [fromEventName[0], fromEventName.slice(1).join(" - ")];
  }

  const competitors = Object.values(event.p || {});
  const home = competitors.find((competitor) => Number(competitor.c) === 1)?.d;
  const away = competitors.find((competitor) => Number(competitor.c) === 2)?.d;
  return [home, away];
}

function getNsoftOdd(event, shortcut) {
  const primaryMarket = Object.values(event.o || {}).find((market) => Number(market.b) === 6);
  const outcome = primaryMarket?.h?.find((item) => item.e === shortcut);
  return Number.isFinite(Number(outcome?.g)) ? Number(outcome.g) : null;
}

function getNsoftTotals25(event) {
  const markets = Object.values(event.o || {}).filter((market) =>
    /total|goals|gol|ukupno|2\.5|0-2|3\+/i.test([market.n, market.d, market.m, market.e].filter(Boolean).join(" ")),
  );
  return totals25FromLines(markets.flatMap((market) => market.h || []));
}

function normalizeNsoftMatches(bookmaker, payload) {
  const events = Array.isArray(payload?.data?.events) ? payload.data.events : [];

  return events
    .filter(
      (event) =>
        (Number(event.f) === Number(bookmaker.tournamentId) || textIncludesWorldCup(event.g)) &&
        !textIncludesWomensCompetition([event.g, event.j, Object.values(event.p || {}).map((item) => item.d).join(" ")].join(" ")),
    )
    .map((event) => {
      const [home, away] = getNsoftTeamNames(event);
      return {
        bookmakerId: bookmaker.id,
        bookmakerName: bookmaker.name,
        source: bookmaker.type,
        matchKey: createMatchKey(home, away, event.n),
        externalId: event.a,
        matchCode: event.r,
        home: normalizeTeamName(home),
        away: normalizeTeamName(away),
        leagueName: "World Cup 2026",
        leagueGroup: String(event.i || ""),
        kickOffTime: event.n ? new Date(event.n).getTime() : null,
        updatedAt: Date.now(),
        odds: {
          home: getNsoftOdd(event, "1"),
          draw: getNsoftOdd(event, "X"),
          away: getNsoftOdd(event, "2"),
        },
        totals25: getNsoftTotals25(event),
      };
    });
}

function getSuperbetTeamNames(event) {
  const fromFixtureName = String(event.fixture?.event_name || "")
    .split("·")
    .map((value) => value.trim())
    .filter(Boolean);

  if (fromFixtureName.length >= 2) {
    return [fromFixtureName[0], fromFixtureName.slice(1).join("·")];
  }

  return [event.fixture?.home_team_name, event.fixture?.away_team_name];
}

function getSuperbetOdd(event, shortcut) {
  const primaryMarket = (event.markets || []).find(
    (market) =>
      Number(market.id) === 547 ||
      String(market.name || "").toLocaleLowerCase("sr-RS").includes("konačan ishod") ||
      String(market.metadata?.tags || "").toLocaleLowerCase("sr-RS").includes("preselected"),
  );
  const outcome = primaryMarket?.odds?.find(
    (item) =>
      item.metadata?.name === shortcut &&
      Number(item.status) === 1 &&
      item.display !== false &&
      Number.isFinite(Number(item.price)),
  );
  return Number.isFinite(Number(outcome?.price)) ? Number(outcome.price) : null;
}

function getSuperbetTotals25(event) {
  const markets = (event.markets || []).filter((market) =>
    /total|goals|gol|ukupno|2\.5/i.test([market.name, market.description, market.metadata?.name].filter(Boolean).join(" ")),
  );
  return totals25FromLines(markets.flatMap((market) => market.odds || []));
}

function normalizeSuperbetMatches(bookmaker, payload) {
  const events = Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : [];

  return events
    .filter((event) => {
      const [home, away] = getSuperbetTeamNames(event);
      return (
        SUPERBET_WORLD_CUP_TOURNAMENTS.includes(String(event.fixture?.tournament_id)) &&
        !textIncludesWomensCompetition([event.fixture?.tournament_name, home, away].join(" "))
      );
    })
    .map((event) => {
      const [home, away] = getSuperbetTeamNames(event);
      const kickOffTime = event.fixture?.utc_date || event.fixture?.unix_date_millis;

      return {
        bookmakerId: bookmaker.id,
        bookmakerName: bookmaker.name,
        source: bookmaker.type,
        matchKey: createMatchKey(home, away, kickOffTime),
        externalId: event.event_id,
        matchCode: event.fixture?.event_code,
        home: normalizeTeamName(home),
        away: normalizeTeamName(away),
        leagueName: "World Cup 2026",
        leagueGroup: String(event.fixture?.tournament_id || ""),
        kickOffTime: toTimestamp(kickOffTime),
        updatedAt: Date.now(),
        odds: {
          home: getSuperbetOdd(event, "1"),
          draw: getSuperbetOdd(event, "X"),
          away: getSuperbetOdd(event, "2"),
        },
        totals25: getSuperbetTotals25(event),
      };
    });
}

function getOddsApiMlMarket(event, bookmakerName) {
  const markets = event.bookmakers?.[bookmakerName] || [];
  return (Array.isArray(markets) ? markets : []).find(
    (market) => String(market.name || "").toLocaleLowerCase("en-US") === "ml",
  );
}

function getOddsApiMlOdds(event, bookmakerName) {
  const market = getOddsApiMlMarket(event, bookmakerName);
  const line = market?.odds?.[0] || {};

  return {
    home: normalizeOddsApiPrice(line.home),
    draw: normalizeOddsApiPrice(line.draw),
    away: normalizeOddsApiPrice(line.away),
  };
}

function getOddsApiTotals25(event, bookmakerName) {
  const markets = event.bookmakers?.[bookmakerName] || [];
  const totalMarkets = (Array.isArray(markets) ? markets : []).filter((market) =>
    /^(ou|total|totals)$/i.test(String(market.name || "")),
  );
  return mergeTotals25(...totalMarkets.map((market) => totals25FromLines(market.odds || market.outcomes || [])));
}

function normalizeOddsApiPrice(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 1 ? numeric : null;
}

function normalizeOddsApiMatches(bookmaker, eventsPayload, oddsPayload) {
  const eventsById = new Map(
    (Array.isArray(eventsPayload) ? eventsPayload : [])
      .filter(isOddsApiWorldCupEvent)
      .map((event) => [String(event.id), event]),
  );
  const oddsEvents = Array.isArray(oddsPayload) ? oddsPayload : [];

  return Array.from(eventsById.values()).flatMap((event) => {
    const oddsEvent = oddsEvents.find((item) => String(item.id) === String(event.id)) || {};
    return ODDS_API_DISPLAY_BOOKMAKERS.map((displayBookmaker) => {
      const mlMarket = getOddsApiMlMarket(oddsEvent, displayBookmaker.name);
      const updatedAt = mlMarket?.updatedAt ? new Date(mlMarket.updatedAt).getTime() : Date.now();

      return {
        bookmakerId: displayBookmaker.id,
        bookmakerName: displayBookmaker.name,
        source: bookmaker.type,
        matchKey: createMatchKey(event.home, event.away, event.date),
        externalId: event.id,
        matchCode: event.id,
        home: normalizeTeamName(event.home),
        away: normalizeTeamName(event.away),
        leagueName: normalizeCompetitionName(event.league?.name || "World Cup 2026"),
        leagueGroup: String(event.league?.slug || ""),
        kickOffTime: toTimestamp(event.date),
        updatedAt,
        odds: getOddsApiMlOdds(oddsEvent, displayBookmaker.name),
        totals25: getOddsApiTotals25(oddsEvent, displayBookmaker.name),
      };
    });
  });
}

function getPinnacleLeagues(payload) {
  if (Array.isArray(payload?.value)) return payload.value;
  if (Array.isArray(payload?.leagues)) return payload.leagues;
  if (Array.isArray(payload?.league)) return payload.league;
  if (Array.isArray(payload)) return payload;
  return [];
}

function getPinnacleEvents(payload) {
  if (payload?.normal) {
    return [
      {
        ...payload.normal,
        info: payload.info,
        leagueId: payload.info?.leagueId,
        leagueName: payload.info?.leagueName,
      },
    ];
  }
  if (Array.isArray(payload?.value)) return payload.value;
  if (Array.isArray(payload?.events)) return payload.events;
  if (Array.isArray(payload?.matchups)) return payload.matchups;
  return getPinnacleLeagues(payload).flatMap((league) => {
    const events = Array.isArray(league.events) ? league.events : [];
    return events.map((event) => ({
      ...event,
      leagueId: event.leagueId || league.id,
      leagueName: event.leagueName || league.name,
    }));
  });
}

function getPinnacleEventId(event) {
  return event.id || event.eventId || event.event_id;
}

function normalizePinnaclePrice(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 1) return null;
  return Number(numeric.toFixed(3));
}

function isValidDecimalOdd(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 1;
}

function getPinnacleMoneyline(event) {
  if (event.prices || event.odds) return event.prices || event.odds;
  if (event.periods && !Array.isArray(event.periods)) {
    return event.periods["0"]?.moneyLine || event.periods[0]?.moneyLine || {};
  }
  const periods = Array.isArray(event.periods) ? event.periods : [];
  const fullGame =
    periods.find((period) => Number(period.number) === 0) ||
    periods.find((period) => String(period.description || "").toLocaleLowerCase("en-US").includes("match")) ||
    periods[0];
  return fullGame?.moneyline || fullGame?.moneyLine || {};
}

function getPinnacleTotals25(event) {
  const directTotals = event.totals || event.totalPoints || event.overUnder;
  if (directTotals) return Array.isArray(directTotals) ? totals25FromLines(directTotals) : totals25FromLineObject(directTotals);

  if (event.periods && !Array.isArray(event.periods)) {
    const period = event.periods["0"] || event.periods[0] || {};
    const totals = period.totals || period.totalPoints || period.overUnder;
    return Array.isArray(totals) ? totals25FromLines(totals) : totals25FromLineObject(totals);
  }

  const periods = Array.isArray(event.periods) ? event.periods : [];
  const fullGame =
    periods.find((period) => Number(period.number) === 0) ||
    periods.find((period) => String(period.description || "").toLocaleLowerCase("en-US").includes("match")) ||
    periods[0] ||
    {};
  const totals = fullGame.totals || fullGame.totalPoints || fullGame.overUnder;
  return Array.isArray(totals) ? totals25FromLines(totals) : totals25FromLineObject(totals);
}

function getPinnacleTeamNames(event) {
  if (Array.isArray(event.participants)) {
    const home = event.participants.find(
      (item) =>
        String(item.alignment || item.type || "").toLocaleLowerCase("en-US") === "home",
    )?.name;
    const away = event.participants.find(
      (item) =>
        String(item.alignment || item.type || "").toLocaleLowerCase("en-US") === "away",
    )?.name;
    if (home || away) return [home, away];
  }

  return [event.home || event.homeTeam || event.homeTeamName, event.away || event.awayTeam || event.awayTeamName];
}

function getPinnacleKickoff(event) {
  return event.time || event.starts || event.startTime || event.startDate || event.eventDate || event.cutoffAt;
}

function normalizePinnacleMatches(bookmaker, eventsPayload, leaguesPayload) {
  const leaguesById = new Map(getPinnacleLeagues(leaguesPayload).map((league) => [String(league.id), league]));

  return getPinnacleEvents(eventsPayload)
    .filter((event) => {
      const status = String(event.status || "").toLocaleLowerCase("en-US");
      const hasLeagueFilter = PINNACLE_LEAGUE_IDS.length > 0;
      const league = leaguesById.get(String(event.leagueId || event.league?.id));
      const leagueName = event.leagueName || event.league?.name || league?.name || league?.englishName;
      const [home, away] = getPinnacleTeamNames(event);
      const isWorldCup = hasLeagueFilter || textIncludesWorldCup([leagueName, home, away].join(" "));
      return (
        isWorldCup &&
        !textIncludesWomensCompetition([leagueName, home, away].join(" ")) &&
        !["settled", "cancelled", "canceled"].includes(status)
      );
    })
    .map((event) => {
      const eventId = getPinnacleEventId(event);
      const league = leaguesById.get(String(event.leagueId || event.league?.id));
      const leagueName =
        event.leagueName || event.info?.leagueName || event.league?.name || league?.name || league?.englishName;
      const [home, away] = getPinnacleTeamNames(event);
      const moneyline = getPinnacleMoneyline(event);
      const kickOffTime = getPinnacleKickoff(event);

      return {
        bookmakerId: bookmaker.id,
        bookmakerName: bookmaker.name,
        source: bookmaker.type,
        matchKey: createMatchKey(home, away, kickOffTime),
        externalId: eventId,
        matchCode: event.rotationNumber || event.rotNum || null,
        home: normalizeTeamName(home),
        away: normalizeTeamName(away),
        leagueName: normalizeCompetitionName(leagueName),
        leagueGroup: String(event.leagueId || event.league?.id || ""),
        kickOffTime: toTimestamp(kickOffTime),
        updatedAt: Date.now(),
        odds: {
          home: normalizePinnaclePrice(moneyline.home ?? moneyline.homePrice),
          draw: normalizePinnaclePrice(moneyline.draw ?? moneyline.drawPrice),
          away: normalizePinnaclePrice(moneyline.away ?? moneyline.awayPrice),
        },
        totals25: getPinnacleTotals25(event),
      };
    });
}

function getPs3838Leagues(payload) {
  if (Array.isArray(payload?.leagues)) return payload.leagues;
  if (Array.isArray(payload?.value)) return payload.value;
  if (Array.isArray(payload)) return payload;
  return [];
}

function getPs3838LeagueEvents(payload) {
  return getPs3838Leagues(payload).flatMap((league) => {
    const events = Array.isArray(league.events) ? league.events : [];
    return events.map((event) => ({
      ...event,
      leagueId: event.leagueId || event.league?.id || league.id,
      leagueName: event.leagueName || event.league?.name || league.name,
    }));
  });
}

function getPs3838EventId(event) {
  return event.id || event.eventId || event.event_id;
}

function getPs3838FullGamePeriod(event) {
  const periods = Array.isArray(event.periods) ? event.periods : [];
  return (
    periods.find((period) => Number(period.number) === 0) ||
    periods.find((period) => String(period.description || "").toLocaleLowerCase("en-US").includes("match")) ||
    periods[0] ||
    {}
  );
}

function getPs3838Moneyline(event) {
  return getPs3838FullGamePeriod(event).moneyline || {};
}

function getPs3838Totals25(event) {
  const totals = getPs3838FullGamePeriod(event).totals || [];
  if (!Array.isArray(totals)) return emptyTotals25();

  const total25 = totals.find((total) => lineIs25(total.points));
  return {
    over: normalizePinnaclePrice(total25?.over),
    under: normalizePinnaclePrice(total25?.under),
  };
}

function isPs3838WorldCupEvent(event) {
  const hasLeagueFilter = PS3838_LEAGUE_IDS.length > 0;
  const joined = [event.leagueName, event.home, event.away].join(" ");
  return hasLeagueFilter || (textIncludesWorldCup(joined) && !textIncludesWomensCompetition(joined));
}

function isPs3838IncludedEvent(event) {
  const status = String(event.status || "").toLocaleLowerCase("en-US");
  const liveStatus = Number(event.liveStatus);
  if (["settled", "cancelled", "canceled"].includes(status)) return false;
  if (!PS3838_IS_LIVE && Number.isFinite(liveStatus) && liveStatus !== 0) return false;
  return isPs3838WorldCupEvent(event);
}

function normalizePs3838Matches(bookmaker, fixturesPayload, oddsPayload) {
  const fixturesById = new Map(
    getPs3838LeagueEvents(fixturesPayload)
      .filter(isPs3838IncludedEvent)
      .map((event) => [String(getPs3838EventId(event)), event]),
  );

  return getPs3838LeagueEvents(oddsPayload)
    .map((oddsEvent) => {
      const eventId = getPs3838EventId(oddsEvent);
      const fixture = fixturesById.get(String(eventId));
      if (!fixture) return null;

      const home = fixture.home || oddsEvent.home;
      const away = fixture.away || oddsEvent.away;
      const kickOffTime = fixture.starts || oddsEvent.starts;
      if (!home || !away || !kickOffTime) return null;

      const moneyline = getPs3838Moneyline(oddsEvent);
      return {
        bookmakerId: bookmaker.id,
        bookmakerName: bookmaker.name,
        source: "ps3838",
        matchKey: createMatchKey(home, away, kickOffTime),
        externalId: eventId,
        matchCode: fixture.rotNum || fixture.rotationNumber || null,
        home: normalizeTeamName(home),
        away: normalizeTeamName(away),
        leagueName: normalizeCompetitionName(fixture.leagueName || oddsEvent.leagueName),
        leagueGroup: String(fixture.leagueId || oddsEvent.leagueId || ""),
        kickOffTime: toTimestamp(kickOffTime),
        updatedAt: Date.now(),
        odds: {
          home: normalizePinnaclePrice(moneyline.home),
          draw: normalizePinnaclePrice(moneyline.draw),
          away: normalizePinnaclePrice(moneyline.away),
        },
        totals25: getPs3838Totals25(oddsEvent),
      };
    })
    .filter(Boolean);
}

function normalizeTeamName(value) {
  const clean = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  const canonical = clean
    .toLocaleLowerCase("sr-RS")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, "and")
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim();

  const aliases = new Map([
    ["bih", "Bosnia and Herzegovina"],
    ["bosnia and herzegovina", "Bosnia and Herzegovina"],
    ["bosnia and herz", "Bosnia and Herzegovina"],
    ["bosna i hercegovina", "Bosnia and Herzegovina"],
    ["czech rep", "Czech Republic"],
    ["czechia", "Czech Republic"],
    ["ceska", "Czech Republic"],
    ["ceska r", "Czech Republic"],
    ["congo dr", "D.R. Congo"],
    ["congo d r", "D.R. Congo"],
    ["d r congo", "D.R. Congo"],
    ["dr congo", "D.R. Congo"],
    ["democratic republic of congo", "D.R. Congo"],
    ["dem republic of congo", "D.R. Congo"],
    ["dem rep of congo", "D.R. Congo"],
    ["dem rep congo", "D.R. Congo"],
    ["drc", "D.R. Congo"],
    ["d r c", "D.R. Congo"],
    ["rd congo", "D.R. Congo"],
    ["dr kongo", "D.R. Congo"],
    ["demokratska republika kongo", "D.R. Congo"],
    ["demokratska rep kongo", "D.R. Congo"],
    ["kongo dr", "D.R. Congo"],
    ["ir iran", "Iran"],
    ["korea republic", "South Korea"],
    ["juzna koreja", "South Korea"],
    ["turkiye", "Turkey"],
    ["turska", "Turkey"],
    ["usa", "United States"],
    ["u s a", "United States"],
    ["sad", "United States"],
    ["alzir", "Algeria"],
    ["argentina", "Argentina"],
    ["australija", "Australia"],
    ["austrija", "Austria"],
    ["belgija", "Belgium"],
    ["brazil", "Brazil"],
    ["engleska", "England"],
    ["egipat", "Egypt"],
    ["ekvador", "Ecuador"],
    ["francuska", "France"],
    ["gana", "Ghana"],
    ["haiti", "Haiti"],
    ["holandija", "Netherlands"],
    ["hrvatska", "Croatia"],
    ["iran", "Iran"],
    ["irak", "Iraq"],
    ["japan", "Japan"],
    ["jordan", "Jordan"],
    ["kanada", "Canada"],
    ["katar", "Qatar"],
    ["kolumbija", "Colombia"],
    ["kurasao", "Curacao"],
    ["maroko", "Morocco"],
    ["meksiko", "Mexico"],
    ["nemacka", "Germany"],
    ["novi zeland", "New Zealand"],
    ["norveska", "Norway"],
    ["obala slonovace", "Ivory Coast"],
    ["panama", "Panama"],
    ["paragvaj", "Paraguay"],
    ["portugal", "Portugal"],
    ["saudijska arabija", "Saudi Arabia"],
    ["senegal", "Senegal"],
    ["skotska", "Scotland"],
    ["spanija", "Spain"],
    ["svedska", "Sweden"],
    ["svajcarska", "Switzerland"],
    ["tunis", "Tunisia"],
    ["urugvaj", "Uruguay"],
    ["uzbekistan", "Uzbekistan"],
    ["zelenortska ostrva", "Cape Verde"],
    ["juzna afrika", "South Africa"],
  ]);

  return aliases.get(canonical) || clean;
}

function normalizeCompetitionName(value) {
  const clean = String(value || "World Cup 2026").replace(/\s+/g, " ").trim();
  if (textIncludesWorldCup(clean)) return "World Cup 2026";
  return clean;
}

function simplifyTeam(value) {
  return normalizeTeamName(value)
    .toLocaleLowerCase("sr-RS")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function toTimestamp(value) {
  if (!value) return null;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function createMatchKey(home, away, kickOffTime) {
  const timestamp = toTimestamp(kickOffTime);
  const day = timestamp ? new Date(timestamp).toISOString().slice(0, 10) : "unknown";
  return `${day}:${simplifyTeam(home)}:${simplifyTeam(away)}`;
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FEED_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        accept: "application/json,text/plain,*/*",
        "accept-language": "sr,en;q=0.9",
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36",
      },
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${text.slice(0, 180)}`);
    }

    return parseJsonPayload(text);
  } catch (error) {
    if (error.name === "AbortError") throw new Error(`Request timed out after ${FEED_TIMEOUT_MS} ms.`);
    throw error.message?.startsWith("HTTP ") ? error : new Error(`Invalid JSON: ${error.message}`);
  } finally {
    clearTimeout(timeout);
  }
}

function pinnacleHeaders() {
  return {
    accept: "application/json, text/plain, */*",
    "accept-language": "en-US,en;q=0.9",
    origin: "https://www.pinnacle888.com",
    referer: "https://www.pinnacle888.com/",
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  };
}

async function fetchPinnacleJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FEED_TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal, headers: pinnacleHeaders() });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${text.slice(0, 180)}`);
    }
    return parseJsonPayload(text);
  } catch (error) {
    if (error.name === "AbortError") throw new Error(`Request timed out after ${FEED_TIMEOUT_MS} ms.`);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchPs3838Json(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FEED_TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal, headers: ps3838Headers() });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${text.slice(0, 180)}`);
    }
    return parseJsonPayload(text);
  } catch (error) {
    if (error.name === "AbortError") throw new Error(`Request timed out after ${FEED_TIMEOUT_MS} ms.`);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function getPinnacleWorldCupLeagueIds(leaguesPayload) {
  if (PINNACLE_LEAGUE_IDS.length) return PINNACLE_LEAGUE_IDS;
  return getPinnacleLeagues(leaguesPayload)
    .filter((league) => textIncludesWorldCup([league.name, league.englishName, league.leagueCode].join(" ")))
    .map((league) => String(league.id))
    .filter(Boolean);
}

function getPinnacleLeagueEventCount(leaguesPayload, leagueIds) {
  const ids = new Set(leagueIds.map(String));
  return getPinnacleLeagues(leaguesPayload)
    .filter((league) => ids.has(String(league.id)))
    .reduce((sum, league) => sum + Number(league.totalEvents || 0), 0);
}

function parseJsonPayload(text) {
  const clean = String(text || "").trim();
  if (!clean.startsWith("data:")) return JSON.parse(clean);

  const dataChunks = clean
    .split(/\n\n+/)
    .flatMap((block) =>
      block
        .split(/\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim()),
    )
    .filter(Boolean);

  if (dataChunks.length === 1) return JSON.parse(dataChunks[0]);
  return dataChunks.flatMap((chunk) => JSON.parse(chunk));
}

function extractFirstSseData(buffer) {
  const blocks = String(buffer || "").split(/\n\n+/);
  const hasCompleteBlock = /\n\n/.test(buffer);
  if (!hasCompleteBlock) return null;

  const candidates = blocks.slice(0, -1);

  for (const block of candidates) {
    const lines = block.split(/\n/).filter((line) => line.startsWith("data:"));
    if (lines.length > 0) {
      return lines.map((line) => line.slice(5).trim()).join("\n");
    }
  }

  return null;
}

async function fetchSseSnapshot(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FEED_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        accept: "text/event-stream,application/json,text/plain,*/*",
        "accept-language": "sr,en;q=0.9",
        "cache-control": "no-cache",
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36",
      },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP ${response.status}: ${text.slice(0, 180)}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("Missing response stream.");

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const data = extractFirstSseData(buffer);
      if (data) {
        controller.abort();
        return JSON.parse(data);
      }
    }

    buffer += decoder.decode();
    const data = extractFirstSseData(buffer);
    if (!data) throw new Error("SSE snapshot did not include a data event.");
    return JSON.parse(data);
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchPs3838Snapshot(bookmaker) {
  const fixturesUrl = ps3838FixturesUrl();
  const oddsUrl = ps3838OddsUrl("v4");
  let resolvedOddsUrl = oddsUrl;

  const [fixturesPayload, oddsPayload] = await Promise.all([
    fetchPs3838Json(fixturesUrl),
    fetchPs3838Json(oddsUrl).catch(async (error) => {
      if (!String(error.message || "").startsWith("HTTP 404")) throw error;
      resolvedOddsUrl = ps3838OddsUrl("v3");
      return fetchPs3838Json(resolvedOddsUrl);
    }),
  ]);
  const matches = normalizePs3838Matches(bookmaker, fixturesPayload, oddsPayload);
  const worldCupFixtures = getPs3838LeagueEvents(fixturesPayload).filter(isPs3838IncludedEvent);

  return {
    bookmaker,
    status: "ok",
    url: resolvedOddsUrl,
    matches,
    fetchedAt: Date.now(),
    totalMatches: getPs3838LeagueEvents(fixturesPayload).length,
    worldCupMatches: worldCupFixtures.length,
    matchedMatches: matches.length,
    source: "ps3838",
  };
}

async function getPs3838BookmakerFeed(bookmaker) {
  const configuredUrl = PS3838_LEAGUE_IDS.length ? ps3838OddsUrl("v4") : ps3838LeaguesUrl();

  if (!PS3838_USERNAME || !PS3838_PASSWORD) {
    return {
      bookmaker,
      status: "configured",
      url: configuredUrl,
      matches: [],
      message: "Set PS3838_USERNAME and PS3838_PASSWORD to enable authenticated PS3838 feed.",
      source: "ps3838",
    };
  }

  if (!PS3838_LEAGUE_IDS.length) {
    return {
      bookmaker,
      status: "configured",
      url: configuredUrl,
      matches: [],
      message: "Set PS3838_LEAGUE_IDS after confirming the World Cup league IDs.",
      source: "ps3838",
    };
  }

  const now = Date.now();
  if (ps3838Cache.result && ps3838Cache.expiresAt > now) {
    return {
      ...ps3838Cache.result,
      cached: true,
      message: ps3838Cache.result.message || `Using cached PS3838 snapshot for ${PS3838_CACHE_MS} ms.`,
    };
  }

  if (!ps3838Cache.promise) {
    ps3838Cache.promise = fetchPs3838Snapshot(bookmaker)
      .then((result) => {
        ps3838Cache.result = result;
        ps3838Cache.expiresAt = Date.now() + PS3838_CACHE_MS;
        return result;
      })
      .finally(() => {
        ps3838Cache.promise = null;
      });
  }

  try {
    return await ps3838Cache.promise;
  } catch (error) {
    if (ps3838Cache.result) {
      return {
        ...ps3838Cache.result,
        cached: true,
        message: `Using cached PS3838 snapshot. Latest refresh failed: ${error.message}`,
      };
    }

    return {
      bookmaker,
      status: "error",
      url: configuredUrl,
      matches: [],
      message: error.message,
      source: "ps3838",
    };
  }
}

async function fetchBookmaker(bookmaker) {
  if (bookmaker.type === "oddsapi") {
    const eventsUrl = oddsApiEventsUrl();

    if (!ODDS_API_KEY) {
      return {
        bookmaker,
        status: "configured",
        url: maskApiKeyUrl(eventsUrl),
        matches: [],
        message: "Set ODDS_API_KEY to enable Odds-API.io World Cup feed.",
      };
    }

    try {
      const eventsPayload = await fetchJson(eventsUrl);
      const worldCupEvents = (Array.isArray(eventsPayload) ? eventsPayload : []).filter(isOddsApiWorldCupEvent);
      const eventIds = worldCupEvents.map((event) => String(event.id)).filter(Boolean);
      const oddsPayload = (
        await Promise.all(
          chunkArray(eventIds, 10).map((chunk) => fetchJson(oddsApiMultiOddsUrl(chunk))),
        )
      ).flat();
      const matches = normalizeOddsApiMatches(bookmaker, worldCupEvents, oddsPayload);

      return {
        bookmaker,
        status: "ok",
        url: maskApiKeyUrl(eventsUrl),
        matches,
        fetchedAt: Date.now(),
        totalMatches: Array.isArray(eventsPayload) ? eventsPayload.length : 0,
        worldCupMatches: worldCupEvents.length,
        matchedMatches: worldCupEvents.length,
      };
    } catch (error) {
      return {
        bookmaker,
        status: "error",
        url: maskApiKeyUrl(eventsUrl),
        matches: [],
        message: error.message,
      };
    }
  }

  if (bookmaker.type === "pinnacle") {
    if (PS3838_ENABLED) {
      return getPs3838BookmakerFeed(bookmaker);
    }

    let url = pinnacleLeagueOddsUrl(PINNACLE_LEAGUE_CODE);

    try {
      if (PINNACLE_USE_LEAGUES_LOOKUP) {
        const leaguesUrl = pinnacleLeaguesUrl();
        url = leaguesUrl;
        const leaguesPayload = await fetchPinnacleJson(leaguesUrl);
        const leagueIds = getPinnacleWorldCupLeagueIds(leaguesPayload);
        const worldCupLeague = getPinnacleLeagues(leaguesPayload).find((league) =>
          leagueIds.includes(String(league.id)),
        );

        if (!leagueIds.length) {
          return {
            bookmaker,
            status: "configured",
            url: leaguesUrl,
            matches: [],
            totalMatches: getPinnacleLeagues(leaguesPayload).length,
            message: "Pinnacle leagues feed is enabled, but no World Cup league was found.",
          };
        }

        url = pinnacleLeagueOddsUrl(worldCupLeague?.leagueCode || PINNACLE_LEAGUE_CODE);
      }

      const oddsPayload = await fetchPinnacleJson(url);
      const matches = normalizePinnacleMatches(bookmaker, oddsPayload, oddsPayload);
      return {
        bookmaker,
        status: "ok",
        url,
        matches,
        fetchedAt: Date.now(),
        totalMatches: getPinnacleEvents(oddsPayload).length,
      };
    } catch (error) {
      return {
        bookmaker,
        status: "error",
        url,
        matches: [],
        message: error.message,
      };
    }
  }

  if (bookmaker.type === "dualsoft") {
    const url = dualsoftOfferUrl(bookmaker.baseUrl);
    try {
      const payload = await fetchJson(url);
      const matches = normalizeDualsoftMatches(bookmaker, payload);
      return {
        bookmaker,
        status: "ok",
        url,
        matches,
        fetchedAt: Date.now(),
        totalMatches: Array.isArray(payload?.esMatches) ? payload.esMatches.length : 0,
      };
    } catch (error) {
      return {
        bookmaker,
        status: "error",
        url,
        matches: [],
        message: error.message,
      };
    }
  }

  if (bookmaker.type === "nsoft") {
    const url = nsoftWorldCupUrl(bookmaker);
    try {
      const payload = await fetchJson(url);
      const matches = normalizeNsoftMatches(bookmaker, payload);
      return {
        bookmaker,
        status: "ok",
        url,
        matches,
        fetchedAt: Date.now(),
        totalMatches: Array.isArray(payload?.data?.events) ? payload.data.events.length : 0,
      };
    } catch (error) {
      return {
        bookmaker,
        status: "error",
        url,
        matches: [],
        message: error.message,
      };
    }
  }

  if (bookmaker.type === "superbet") {
    const url = superbetWorldCupUrl(bookmaker);
    try {
      const payload = await fetchSseSnapshot(url);
      const matches = normalizeSuperbetMatches(bookmaker, payload);
      return {
        bookmaker,
        status: "ok",
        url,
        matches,
        fetchedAt: Date.now(),
        totalMatches: Array.isArray(payload) ? payload.length : 0,
      };
    } catch (error) {
      return {
        bookmaker,
        status: "error",
        url,
        matches: [],
        message: error.message,
      };
    }
  }

  if (bookmaker.type !== "dualsoft") {
    return {
      bookmaker,
      status: "configured",
      url: bookmaker.baseUrl,
      matches: [],
      message: "Adapter endpoint configured; normalizer not enabled yet.",
    };
  }

  return {
    bookmaker,
    status: "configured",
    url: bookmaker.baseUrl,
    matches: [],
    message: "Adapter endpoint configured; normalizer not enabled yet.",
  };
}

function emptyBookmakerMap() {
  return Object.fromEntries(
    DISPLAY_BOOKMAKERS.map((bookmaker) => [
      bookmaker.id,
      {
        bookmakerId: bookmaker.id,
        bookmakerName: bookmaker.name,
        isReference: Boolean(bookmaker.isReference),
        odds: { home: null, draw: null, away: null },
        totals25: emptyTotals25(),
        updatedAt: null,
        externalId: null,
      },
    ]),
  );
}

function makeMatchRow(offer, truthSource = null) {
  return {
    matchKey: offer.matchKey,
    home: offer.home,
    away: offer.away,
    leagueName: offer.leagueName,
    kickOffTime: offer.kickOffTime,
    sourceOfTruth: truthSource?.bookmakerId || null,
    sourceExternalId: truthSource?.externalId || null,
    bookmakers: emptyBookmakerMap(),
  };
}

function attachOffer(row, offer) {
  row.bookmakers[offer.bookmakerId] = {
    bookmakerId: offer.bookmakerId,
    bookmakerName: offer.bookmakerName,
    isReference: Boolean(offer.isReference),
    odds: offer.odds,
    totals25: offer.totals25 || emptyTotals25(),
    updatedAt: offer.updatedAt,
    externalId: offer.externalId,
  };
}

function findTruthRow(byMatch, offer) {
  const exact = byMatch.get(offer.matchKey);
  if (exact) return exact;

  const offerHome = simplifyTeam(offer.home);
  const offerAway = simplifyTeam(offer.away);
  const offerTime = Number(offer.kickOffTime || 0);

  for (const row of byMatch.values()) {
    const sameTeams = simplifyTeam(row.home) === offerHome && simplifyTeam(row.away) === offerAway;
    if (!sameTeams) continue;

    const rowTime = Number(row.kickOffTime || 0);
    if (!rowTime || !offerTime || Math.abs(rowTime - offerTime) <= 36 * 60 * 60 * 1000) {
      return row;
    }
  }

  return null;
}

function compareOdds(a, b) {
  return (Number(b || 0) - Number(a || 0)).toFixed(2);
}

function shinProbabilities(odds) {
  const prices = odds.map((value) => Number(value));
  if (prices.some((value) => !Number.isFinite(value) || value <= 1)) return null;

  const inverseOdds = prices.map((value) => 1 / value);
  const marketPercent = inverseOdds.reduce((sum, value) => sum + value, 0);
  if (marketPercent <= 1) {
    return inverseOdds.map((value) => value / marketPercent);
  }

  const shinSum = (z) =>
    inverseOdds.reduce(
      (sum, value) =>
        sum +
        (Math.sqrt(z * z + (4 * (1 - z) * value * value) / marketPercent) - z) /
          (2 * (1 - z)),
      0,
    );

  let low = 0;
  let high = 0.999999;
  for (let index = 0; index < 80; index += 1) {
    const mid = (low + high) / 2;
    if (shinSum(mid) > 1) low = mid;
    else high = mid;
  }

  const z = (low + high) / 2;
  return inverseOdds.map(
    (value) =>
      (Math.sqrt(z * z + (4 * (1 - z) * value * value) / marketPercent) - z) /
      (2 * (1 - z)),
  );
}

function shinNoVigOdds(values) {
  const probabilities = shinProbabilities(values);
  if (!probabilities) return values.map(() => null);
  return probabilities.map((probability) =>
    Number.isFinite(probability) && probability > 0 ? Number((1 / probability).toFixed(3)) : null,
  );
}

function applyPinnacleShinNoVig(match) {
  const pinnacle = match.bookmakers.pinnacle;
  const [home, draw, away] = shinNoVigOdds([
    pinnacle?.odds?.home,
    pinnacle?.odds?.draw,
    pinnacle?.odds?.away,
  ]);
  const [over, under] = shinNoVigOdds([
    pinnacle?.totals25?.over,
    pinnacle?.totals25?.under,
  ]);

  match.bookmakers[PINNACLE_SHIN_BOOKMAKER.id] = {
    bookmakerId: PINNACLE_SHIN_BOOKMAKER.id,
    bookmakerName: PINNACLE_SHIN_BOOKMAKER.name,
    isReference: true,
    odds: { home, draw, away },
    totals25: { over, under },
    updatedAt: pinnacle?.updatedAt || null,
    externalId: pinnacle?.externalId || null,
  };
}

function aggregateMatches(results) {
  const byMatch = new Map();
  const truthResult = results.find((result) => result.bookmaker.sourceOfTruth && result.status === "ok" && result.matches.length);

  if (truthResult) {
    for (const offer of truthResult.matches) {
      const row =
        byMatch.get(offer.matchKey) ||
        makeMatchRow(offer, {
          bookmakerId: truthResult.bookmaker.id,
          externalId: offer.externalId,
        });
      attachOffer(row, offer);
      byMatch.set(offer.matchKey, row);
    }

    for (const result of results) {
      if (result === truthResult) continue;
      result.matchedMatches = 0;
      for (const offer of result.matches) {
        const row = findTruthRow(byMatch, offer);
        if (!row) continue;
        attachOffer(row, offer);
        result.matchedMatches += 1;
      }
    }
  } else {
    for (const result of results) {
      for (const offer of result.matches) {
        if (!byMatch.has(offer.matchKey)) {
          byMatch.set(offer.matchKey, makeMatchRow(offer));
        }

        attachOffer(byMatch.get(offer.matchKey), offer);
      }
    }
  }

  return Array.from(byMatch.values())
    .map((match) => {
      applyPinnacleShinNoVig(match);
      return {
        ...match,
        best: getBestOdds(match.bookmakers),
        bestTotals25: getBestTotals25(match.bookmakers),
        margin: estimateBestMargin(match.bookmakers),
      };
    })
    .sort((a, b) => Number(a.kickOffTime || 0) - Number(b.kickOffTime || 0));
}

function getBestOdds(bookmakers) {
  const outcomes = ["home", "draw", "away"];
  const best = {};

  for (const outcome of outcomes) {
    let top = { value: null, bookmakerId: null, bookmakerName: null };
    for (const entry of Object.values(bookmakers)) {
      if (entry.isReference) continue;
      const value = entry.odds?.[outcome];
      if (isValidDecimalOdd(value) && (!top.value || Number(value) > top.value)) {
        top = {
          value: Number(value),
          bookmakerId: entry.bookmakerId,
          bookmakerName: entry.bookmakerName,
        };
      }
    }
    best[outcome] = top;
  }

  return best;
}

function getBestTotals25(bookmakers) {
  const outcomes = [
    ["over", "over"],
    ["under", "under"],
  ];
  const best = {};

  for (const [key, field] of outcomes) {
    let top = { value: null, bookmakerId: null, bookmakerName: null };
    for (const entry of Object.values(bookmakers)) {
      if (entry.isReference) continue;
      const value = entry.totals25?.[field];
      if (isValidDecimalOdd(value) && (!top.value || Number(value) > top.value)) {
        top = {
          value: Number(value),
          bookmakerId: entry.bookmakerId,
          bookmakerName: entry.bookmakerName,
        };
      }
    }
    best[key] = top;
  }

  return best;
}

function estimateBestMargin(bookmakers) {
  const best = getBestOdds(bookmakers);
  const values = [best.home.value, best.draw.value, best.away.value];
  if (values.some((value) => !value)) return null;
  const implied = values.reduce((sum, value) => sum + 1 / value, 0);
  return Number(((implied - 1) * 100).toFixed(2));
}

function buildOpportunities(matches) {
  return matches
    .flatMap((match) =>
      ["home", "draw", "away"].map((outcome) => {
        const best = match.best[outcome];
        const second = Object.values(match.bookmakers)
          .filter((entry) => !entry.isReference)
          .map((entry) => Number(entry.odds?.[outcome]))
          .filter(Boolean)
          .sort((a, b) => b - a)[1];

        return {
          matchKey: match.matchKey,
          label:
            outcome === "home"
              ? match.home
              : outcome === "draw"
                ? "Nereseno"
                : match.away,
          matchup: `${match.home} - ${match.away}`,
          outcome,
          bookmakerName: best.bookmakerName,
          value: best.value,
          edge: second ? compareOdds(second, best.value) : null,
        };
      }),
    )
    .filter((item) => item.value)
    .sort((a, b) => Number(b.edge || 0) - Number(a.edge || 0))
    .slice(0, 8);
}

function isLocalRequest(req) {
  const rawHost = String(req.headers.host || "");
  const host = rawHost.startsWith("[") ? rawHost.slice(0, rawHost.indexOf("]") + 1) : rawHost.split(":")[0];
  return ["localhost", "127.0.0.1", "::1", "[::1]"].includes(host);
}

async function getPs3838LeaguesPayload() {
  const url = ps3838LeaguesUrl();

  if (!PS3838_USERNAME || !PS3838_PASSWORD) {
    return {
      status: "configured",
      source: "ps3838",
      url,
      leagues: [],
      message: "Set PS3838_USERNAME and PS3838_PASSWORD to inspect PS3838 leagues.",
    };
  }

  const payload = await fetchPs3838Json(url);
  const leagues = getPs3838Leagues(payload).map((league) => ({
    id: league.id,
    name: league.name || league.englishName,
    sportId: league.sportId || PS3838_SPORT_ID,
    eventCount: league.eventCount ?? league.totalEvents ?? null,
    isWorldCupCandidate: textIncludesWorldCup([league.name, league.englishName].join(" ")),
  }));

  return {
    status: "ok",
    source: "ps3838",
    url,
    generatedAt: Date.now(),
    totalLeagues: leagues.length,
    candidates: leagues.filter((league) => league.isWorldCupCandidate),
    leagues,
  };
}

export async function getOddsPayload() {
  const startedAt = Date.now();
  const settled = await Promise.all(FEED_BOOKMAKERS.map(fetchBookmaker));
  const matches = aggregateMatches(settled);

  return {
    generatedAt: Date.now(),
    elapsedMs: Date.now() - startedAt,
    bookmakers: DISPLAY_BOOKMAKERS.map(({ id, name, type, baseUrl, isReference }) => ({
      id,
      name,
      type,
      baseUrl,
      isReference: Boolean(isReference),
    })),
    feeds: settled.map((result) => ({
      bookmakerId: result.bookmaker.id,
      bookmakerName: result.bookmaker.name,
      status: result.status,
      url: result.url,
      source: result.source || result.bookmaker.type,
      cached: Boolean(result.cached),
      totalMatches: result.totalMatches || 0,
      worldCupMatches: result.worldCupMatches ?? result.matches.length,
      matchedMatches: result.matchedMatches ?? result.worldCupMatches ?? result.matches.length,
      message: result.message || null,
    })),
    matches,
    opportunities: buildOpportunities(matches),
    filter: {
      sport: "football",
      competition: "FIFA World Cup 2026",
      terms: WORLD_CUP_TERMS,
      note:
        matches.length === 0
          ? "No World Cup-labelled matches were returned by the enabled feeds yet."
          : null,
    },
  };
}

export function getHealthPayload() {
  return { ok: true, bookmakers: DISPLAY_BOOKMAKERS.length };
}

async function handleOdds(req, res) {
  sendJson(res, 200, await getOddsPayload());
}

async function handlePs3838Leagues(req, res) {
  if (!isLocalRequest(req)) {
    sendJson(res, 403, { error: "PS3838 league discovery is only available from localhost." });
    return;
  }

  sendJson(res, 200, await getPs3838LeaguesPayload());
}

async function handleStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  const safePath = normalize(pathname).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(publicDir, safePath);

  if (!filePath.startsWith(publicDir)) {
    sendText(res, 403, "Forbidden");
    return;
  }

  try {
    const buffer = await readFile(filePath);
    sendText(res, 200, buffer, contentTypes[extname(filePath)] || "application/octet-stream");
  } catch {
    sendText(res, 404, "Not found");
  }
}

if (process.argv[1] && normalize(process.argv[1]) === normalize(join(projectDir, "server.js"))) {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      if (url.pathname === "/api/odds") {
        await handleOdds(req, res);
        return;
      }

      if (url.pathname === "/api/health") {
        sendJson(res, 200, getHealthPayload());
        return;
      }

      if (url.pathname === "/api/ps3838/leagues") {
        await handlePs3838Leagues(req, res);
        return;
      }

      await handleStatic(req, res);
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
  });

  server.on("error", (error) => {
    if (error.code === "EADDRINUSE") {
      console.error(`Port ${PORT} is already in use.`);
      console.error(`Stop the existing server or run this one with: PORT=${PORT + 1} npm run dev`);
      process.exit(1);
    }

    throw error;
  });

  server.listen(PORT, () => {
    console.log(`SP Kvote running on http://localhost:${PORT}`);
  });
}
