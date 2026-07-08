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
const IS_NETLIFY = Boolean(process.env.NETLIFY);
const FEED_TIMEOUT_MS = Number(process.env.FEED_TIMEOUT_MS || (IS_NETLIFY ? 6000 : 4000));


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

const COMPETITIONS = [
  {
    id: "world-cup",
    label: "World Cup 2026",
    terms: WORLD_CUP_TERMS,
    pinnacleLeagueCode: "fifa-world-cup",
    nsoftTournamentId: 30,
    nsoftDateRange: { from: "2026-06-07T00:00:00", to: "2026-07-20T23:59:59" },
    superbetTournaments: SUPERBET_WORLD_CUP_TOURNAMENTS,
    superbetDateRange: { startDate: "2026-06-07T00:00:00.000Z", endDate: "2028-06-07T00:00:00.000Z" },
    oddsmathLeagueId: 115437,
    btfTerms: ["world cup"],
  },
  {
    id: "epl",
    label: "England - Premier League",
    pinnacleLeagueCode: "england-premier-league",
    nsoftTournamentId: 33,
    superbetTournaments: ["106"],
    oddsmathLeagueId: 1281,
    dualsoftCountry: "England",
    dualsoftLeagueName: "Premier League",
    mozzartCountryTerm: "england",
    mozzartLeagueTerm: "premier league",
    btfTerms: ["premier league"],
  },
  {
    id: "bundesliga",
    label: "Germany - Bundesliga",
    pinnacleLeagueCode: "germany-bundesliga",
    nsoftTournamentId: 87,
    superbetTournaments: ["245"],
    oddsmathLeagueId: 1219,
    dualsoftCountry: "Germany",
    dualsoftLeagueName: "Bundesliga",
    mozzartCountryTerm: "germany",
    mozzartLeagueTerm: "bundesliga",
    btfTerms: ["bundesliga"],
  },
  {
    id: "ligue-1",
    label: "France - Ligue 1",
    pinnacleLeagueCode: "france-ligue-1",
    nsoftTournamentId: 84,
    superbetTournaments: ["100"],
    oddsmathLeagueId: 1083,
    dualsoftCountry: "France",
    dualsoftLeagueName: "Ligue 1",
    mozzartCountryTerm: "france",
    mozzartLeagueTerm: "ligue 1",
    btfTerms: ["ligue 1"],
  },
  {
    id: "serie-a",
    label: "Italy - Serie A",
    pinnacleLeagueCode: "italy-serie-a",
    nsoftTournamentId: 51,
    superbetTournaments: ["104"],
    oddsmathLeagueId: 1315,
    dualsoftCountry: "Italy",
    dualsoftLeagueName: "Serie A",
    mozzartCountryTerm: "italy",
    mozzartLeagueTerm: "serie a",
    btfTerms: ["serie a"],
  },
  {
    id: "laliga",
    label: "Spain - LaLiga",
    pinnacleLeagueCode: "spain-la-liga",
    nsoftTournamentId: 15,
    superbetTournaments: ["98"],
    oddsmathLeagueId: 1122,
    dualsoftCountry: "Spain",
    dualsoftLeagueName: "LaLiga",
    mozzartCountryTerm: "spain",
    mozzartLeagueTerm: "la liga",
    btfTerms: ["la liga", "laliga"],
  },
];

const DEFAULT_COMPETITION_ID = "world-cup";

function getCompetitionById(id) {
  return COMPETITIONS.find((competition) => competition.id === id) || COMPETITIONS.find((competition) => competition.id === DEFAULT_COMPETITION_ID);
}

function defaultDateRangeIso(days = 180) {
  const from = new Date();
  const to = new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
  return {
    from: from.toISOString().slice(0, 19),
    to: to.toISOString().slice(0, 19),
  };
}

function defaultSuperbetDateRange(days = 180) {
  const from = new Date();
  from.setUTCHours(0, 0, 0, 0);
  const to = new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
  return {
    startDate: from.toISOString(),
    endDate: to.toISOString(),
  };
}

const BOOKMAKERS = [
  {
    id: "pinnacle",
    name: "Pinnacle",
    type: "pinnacle",
    baseUrl: PINNACLE_API_BASE,
    sourceOfTruth: true,
  },
  {
    id: "merkurxtip",
    name: "MerkurXtip",
    type: "dualsoft",
    baseUrl: "https://www.merkurxtip.rs",
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
    id: "mozzartbet",
    name: "Mozzart",
    type: "mozzartbet",
    baseUrl: "https://www.mozzartbet.ng",
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
  },
  {
    id: "betinasia",
    name: "BetInAsia",
    type: "oddsmath",
    baseUrl: "https://www.oddsmath.com",
  },
  {
    id: "betfair_lay",
    name: "Betfair Lay",
    type: "oddsmath",
    baseUrl: "https://www.oddsmath.com",
    isReference: true,
  },
];

const PINNACLE_SHIN_BOOKMAKER = {
  id: "pinnacle_shin",
  name: "Pinnacle no-vig",
  type: "reference",
  baseUrl: PINNACLE_API_BASE,
  isReference: true,
};
const NO_VIG_FALLBACK_BOOKMAKER = "betinasia";

const DISPLAY_BOOKMAKERS = [PINNACLE_SHIN_BOOKMAKER, ...BOOKMAKERS];
const FEED_BOOKMAKERS = BOOKMAKERS;

const mozzartbetCache = new Map();
const oddsmathCache = new Map();

function getCacheEntry(cacheMap, key) {
  let entry = cacheMap.get(key);
  if (!entry) {
    entry = { expiresAt: 0, promise: null, result: null };
    cacheMap.set(key, entry);
  }
  return entry;
}

const btfoddsCache = {
  expiresAt: 0,
  promise: null,
  result: null,
  history: {},
};

async function fetchBtfOdds(competition) {
  const btfTerms = (competition?.btfTerms || ["world cup"]).map((term) => term.toLocaleLowerCase("sr-RS"));
  const url = 'https://www.btfodds.com/classes/soccer/football-odds-trends/money-way-ajax.php?alldata=%7B%22id%22:%221%22,%22sport%22:%22soccer%22,%22pg%22:%22soccer/football-odds-trends/money-way%22,%22date%22:%22next-3days%22,%22country%22:%22all%22,%22bookie%22:%2212X%22,%22type%22:%22league%22,%22sort%22:%22OV%22,%22oddType%22:%22eu%22,%22tz%22:%22%22,%22upd%22:5%7D';
  try {
    const res = await fetch(url, {
      headers: {
        "X-Requested-With": "XMLHttpRequest",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "text/html, */*; q=0.01",
      }
    });
    const html = await res.text();
    const matches = {};
    let currentLeague = "";
    const rows = html.split('<tr ');
    for (const row of rows) {
      if (!row.trim()) continue;
      if (row.includes('class="league"')) {
        const match = row.match(/<span class="sort">([^<]+)<\/span>/);
        if (match) currentLeague = match[1].trim();
        continue;
      }
      const currentLeagueLower = currentLeague.toLocaleLowerCase("sr-RS");
      if (row.includes('class="mw"') && btfTerms.some((term) => currentLeagueLower.includes(term))) {
        let home = null;
        let away = null;
        const aTagMatch = row.match(/<td class="event"><a[^>]*>(.*?)<\/a><\/td>/);
        if (aTagMatch) {
          const cleaned = aTagMatch[1].replace(/<[^>]+>/g, '').split(' VS ');
          if (cleaned.length === 2) { home = cleaned[0].trim(); away = cleaned[1].trim(); }
        }
        if (!home || !away) continue;

        const volumeMatches = [...row.matchAll(/data-volume="([\d.]+)"/g)];
        const vol1 = volumeMatches[0] ? Number(volumeMatches[0][1]) : 0;
        const volX = volumeMatches[1] ? Number(volumeMatches[1][1]) : 0;
        const vol2 = volumeMatches[2] ? Number(volumeMatches[2][1]) : 0;
        
        const matchKey = createMatchKey(home, away, null);
        matches[matchKey] = { home: vol1, draw: volX, away: vol2, updated: Date.now() };
        
        if (!btfoddsCache.history[matchKey]) btfoddsCache.history[matchKey] = [];
        btfoddsCache.history[matchKey].push(matches[matchKey]);
        if (btfoddsCache.history[matchKey].length > 50) {
          btfoddsCache.history[matchKey].shift();
        }
      }
    }
    return matches;
  } catch (err) {
    console.error("BTFOdds fetch error:", err);
    return null;
  }
}

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

function nsoftCompetitionUrl(bookmaker, competition) {
  const dateRange = competition.nsoftDateRange || defaultDateRangeIso();
  const params = new URLSearchParams({
    companyUuid: bookmaker.companyUuid,
    "filter[from]": dateRange.from,
    "filter[to]": dateRange.to,
    "filter[tournamentId]": String(competition.nsoftTournamentId),
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

function superbetCompetitionUrl(bookmaker, competition) {
  const dateRange = competition.superbetDateRange || defaultSuperbetDateRange();
  const params = new URLSearchParams({
    sports: "5",
    tournaments: competition.superbetTournaments.join(","),
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
  });

  return `${bookmaker.baseUrl}/sr-Latn-RS/prematch?${params.toString()}`;
}



function chunkArray(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
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

function textIncludesWorldCup(value) {
  return textIncludesTerms(value, WORLD_CUP_TERMS);
}

function textIncludesTerms(value, terms) {
  const haystack = String(value || "").toLocaleLowerCase("sr-RS");
  return (terms || []).some((term) => haystack.includes(term));
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

function matchesCompetitionTerms(match, competition) {
  const joined = [
    match.leagueName,
    match.leagueToken,
    match.leagueGroupToken,
    match.home,
    match.away,
  ].join(" ");

  return textIncludesTerms(joined, competition.terms) && !textIncludesWomensCompetition(joined);
}

function matchesDualsoftCompetition(match, competition) {
  if (competition.dualsoftCountry && competition.dualsoftLeagueName) {
    const token = String(match.leagueGroupToken || "");
    const name = String(match.leagueName || "").trim().toLocaleLowerCase("sr-RS");
    const womensJoined = [match.leagueName, match.leagueGroupToken, match.home, match.away].join(" ");
    return (
      token.includes(competition.dualsoftCountry) &&
      name === competition.dualsoftLeagueName.toLocaleLowerCase("sr-RS") &&
      !textIncludesWomensCompetition(womensJoined)
    );
  }
  return matchesCompetitionTerms(match, competition);
}

function getPinnacleQualifyOdds(event) {
  const periods = event.periods;
  if (!periods || Array.isArray(periods)) return { home: null, away: null };
  const p8 = periods["8"];
  if (!p8?.moneyLine || p8.moneyLine.unavailable) return { home: null, away: null };
  return {
    home: normalizePinnaclePrice(p8.moneyLine.homePrice ?? p8.moneyLine.home),
    away: normalizePinnaclePrice(p8.moneyLine.awayPrice ?? p8.moneyLine.away),
  };
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
  return { over: null, under: null, line: null };
}

function normalizePrice(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 1 ? Number(numeric.toFixed(3)) : null;
}

function normalizeGoalsLine(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Number(numeric.toFixed(2)) : null;
}

function textLooksOver(value) {
  const text = String(value || "")
    .toLocaleLowerCase("sr-RS")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return /\bover\b|\bo\b|vise|preko|3\+/.test(text);
}

function textLooksUnder(value) {
  const text = String(value || "")
    .toLocaleLowerCase("sr-RS")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return /\bunder\b|\bu\b|manje|ispod|0-2/.test(text);
}

function totalLineFromObject(item) {
  return (
    item?.points ??
    item?.point ??
    item?.line ??
    item?.handicap ??
    item?.total ??
    item?.metadata?.specifiers?.total ??
    item?.metadata?.special_bet_value ??
    item?.value ??
    item?.p
  );
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

function emptyTotalsByLine() {
  return {};
}

function setTotalsLine(totalsByLine, lineValue, totals) {
  const line = normalizeGoalsLine(lineValue);
  if (line === null) return;

  const key = String(line);
  const existing = totalsByLine[key] || emptyTotals25();
  totalsByLine[key] = {
    line,
    over: existing.over || normalizePrice(totals.over),
    under: existing.under || normalizePrice(totals.under),
  };
}

function totalsByLineFromLines(lines) {
  const totalsByLine = emptyTotalsByLine();
  if (!Array.isArray(lines)) return totalsByLine;

  for (const line of lines) {
    const lineValue = totalLineFromObject(line);
    const nestedOutcomes = line?.outcomes || line?.prices || line?.odds || line?.h;
    const directOver = normalizePrice(sidePriceFromObject(line.over ?? line.overPrice ?? line.overOdds ?? line.o));
    const directUnder = normalizePrice(sidePriceFromObject(line.under ?? line.underPrice ?? line.underOdds ?? line.u));

    if (directOver || directUnder) {
      setTotalsLine(totalsByLine, lineValue, { over: directOver, under: directUnder });
    }

    if (Array.isArray(nestedOutcomes)) {
      for (const outcome of nestedOutcomes) {
        const outcomeLine = totalLineFromObject(outcome) ?? lineValue;
        const normalizedLine = normalizeGoalsLine(outcomeLine);
        if (normalizedLine === null) continue;

        const name = getOutcomeName(outcome);
        const price = normalizePrice(priceFromObject(outcome));
        const current = totalsByLine[String(normalizedLine)] || {
          line: normalizedLine,
          over: null,
          under: null,
        };
        if (textLooksOver(name)) current.over ||= price;
        if (textLooksUnder(name)) current.under ||= price;
        totalsByLine[String(normalizedLine)] = current;
      }
    }
  }

  return totalsByLine;
}

function totalsForLine(totalsByLine, line) {
  const normalizedLine = normalizeGoalsLine(line);
  if (normalizedLine === null) return emptyTotals25();
  const totals = totalsByLine?.[String(normalizedLine)] || {};
  return {
    line: normalizedLine,
    over: normalizePrice(totals.over),
    under: normalizePrice(totals.under),
  };
}

function totals25FromLines(lines) {
  return totalsForLine(totalsByLineFromLines(lines), 2.5);
}

function totalsByLineFromLineObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return totalsByLineFromLines(value);
  return totalsByLineFromLines(
    Object.entries(value).map(([line, item]) =>
      item && typeof item === "object" ? { line, ...item } : { line, value: item },
    ),
  );
}

function totals25FromLineObject(value) {
  return totalsForLine(totalsByLineFromLineObject(value), 2.5);
}

function mergeTotalsByLine(...items) {
  return items.reduce((merged, item) => {
    for (const totals of Object.values(item || {})) {
      setTotalsLine(merged, totals.line, totals);
    }
    return merged;
  }, emptyTotalsByLine());
}

function mergeTotals25(...items) {
  return totalsForLine(
    mergeTotalsByLine(...items.map((item) => (item?.line ? { [String(item.line)]: item } : {}))),
    2.5,
  );
}

function dualsoftTotalsByLine(match) {
  const totalsByLine = emptyTotalsByLine();
  setTotalsLine(totalsByLine, 2.5, {
    over: getDualsoftOdd(match, "24"),
    under: getDualsoftOdd(match, "22"),
  });
  setTotalsLine(totalsByLine, 3.5, {
    over: getDualsoftOdd(match, "25"),
    under: getDualsoftOdd(match, "219"),
  });

  return mergeTotalsByLine(
    totalsByLine,
    totalsByLineFromLines(Object.values(match.betMap || {}).flatMap((item) => Object.values(item || {}))),
  );
}

function nsoftTotalsByLine(event) {
  const totalsByLine = emptyTotalsByLine();
  const goalsMarket = Object.values(event.o || {}).find((market) => Number(market.b) === 443);
  const goalsOutcomes = goalsMarket?.h || [];
  const outcome = (shortcut) => goalsOutcomes.find((item) => item.e === shortcut)?.g;

  setTotalsLine(totalsByLine, 2.5, { under: outcome("0-2"), over: outcome("3+") });
  setTotalsLine(totalsByLine, 3.5, { under: outcome("0-3"), over: outcome("4+") });
  return totalsByLine;
}

function normalizeDualsoftMatches(bookmaker, payload, competition) {
  const matches = Array.isArray(payload?.esMatches) ? payload.esMatches : [];

  return matches.filter((match) => matchesDualsoftCompetition(match, competition)).map((match) => ({
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
    totalsByLine: dualsoftTotalsByLine(match),
    qualifyOdds: { home: null, away: null },
  }));
}

async function enrichDualsoftWithQualifyOdds(bookmaker, matches) {
  const params = new URLSearchParams({ annex: "0", mobileVersion: "1.23.9", locale: LOCALE });
  await Promise.all(
    matches.map(async (match) => {
      if (!match.externalId) return;
      try {
        const url = `${bookmaker.baseUrl}/restapi/offer/${LOCALE}/match/${match.externalId}?${params}`;
        const payload = await fetchJson(url, Math.min(FEED_TIMEOUT_MS, 5000));
        const odds = payload?.odds || {};
        const home = normalizePrice(odds["335"]);
        const away = normalizePrice(odds["336"]);
        if (home !== null || away !== null) {
          match.qualifyOdds = { home, away };
        }
      } catch {
        // qualify odds are optional
      }
    }),
  );
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
  return totalsForLine(nsoftTotalsByLine(event), 2.5);
}

function normalizeNsoftMatches(bookmaker, payload, competition) {
  const events = Array.isArray(payload?.data?.events) ? payload.data.events : [];

  return events
    .filter(
      (event) =>
        Number(event.f) === Number(competition.nsoftTournamentId) &&
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
        leagueName: normalizeCompetitionName(event.g) || competition.label,
        leagueGroup: String(event.i || ""),
        kickOffTime: event.n ? new Date(event.n).getTime() : null,
        updatedAt: Date.now(),
        odds: {
          home: getNsoftOdd(event, "1"),
          draw: getNsoftOdd(event, "X"),
          away: getNsoftOdd(event, "2"),
        },
        totalsByLine: nsoftTotalsByLine(event),
        qualifyOdds: { home: null, away: null },
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


function normalizeSuperbetMatches(bookmaker, payload, competition) {
  const events = Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : [];

  return events
    .filter((event) => {
      const [home, away] = getSuperbetTeamNames(event);
      return (
        competition.superbetTournaments.includes(String(event.fixture?.tournament_id)) &&
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
        leagueName: competition.label,
        leagueGroup: String(event.fixture?.tournament_id || ""),
        kickOffTime: toTimestamp(kickOffTime),
        updatedAt: Date.now(),
        odds: {
          home: getSuperbetOdd(event, "1"),
          draw: getSuperbetOdd(event, "X"),
          away: getSuperbetOdd(event, "2"),
        },
        totalsByLine: emptyTotalsByLine(),
        qualifyOdds: { home: null, away: null },
      };
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
  return totalsForLine(getPinnacleTotalsByLine(event), 2.5);
}

function getPinnacleTotalsByLine(event) {
  const directTotals = event.totals || event.totalPoints || event.overUnder;
  if (directTotals) return Array.isArray(directTotals) ? totalsByLineFromLines(directTotals) : totalsByLineFromLineObject(directTotals);

  if (event.periods && !Array.isArray(event.periods)) {
    const period = event.periods["0"] || event.periods[0] || {};
    const totals = period.totals || period.totalPoints || period.overUnder;
    return Array.isArray(totals) ? totalsByLineFromLines(totals) : totalsByLineFromLineObject(totals);
  }

  const periods = Array.isArray(event.periods) ? event.periods : [];
  const fullGame =
    periods.find((period) => Number(period.number) === 0) ||
    periods.find((period) => String(period.description || "").toLocaleLowerCase("en-US").includes("match")) ||
    periods[0] ||
    {};
  const totals = fullGame.totals || fullGame.totalPoints || fullGame.overUnder;
  return Array.isArray(totals) ? totalsByLineFromLines(totals) : totalsByLineFromLineObject(totals);
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

function normalizePinnacleMatches(bookmaker, eventsPayload, leaguesPayload, competition) {
  const leaguesById = new Map(getPinnacleLeagues(leaguesPayload).map((league) => [String(league.id), league]));

  return getPinnacleEvents(eventsPayload)
    .filter((event) => {
      const status = String(event.status || "").toLocaleLowerCase("en-US");
      const hasLeagueFilter = PINNACLE_LEAGUE_IDS.length > 0 || !competition.terms?.length;
      const league = leaguesById.get(String(event.leagueId || event.league?.id));
      const leagueName = event.leagueName || event.league?.name || league?.name || league?.englishName;
      const [home, away] = getPinnacleTeamNames(event);
      const isMatch = hasLeagueFilter || textIncludesTerms([leagueName, home, away].join(" "), competition.terms);
      return (
        isMatch &&
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
        totalsByLine: getPinnacleTotalsByLine(event),
        qualifyOdds: getPinnacleQualifyOdds(event),
      };
    });
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
    ["bosnia-herzegovina", "Bosnia and Herzegovina"],
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
    ["s korea", "South Korea"],
    ["skorea", "South Korea"],
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
    ["n zealand", "New Zealand"],
    ["nzealand", "New Zealand"],
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
    ["s africa", "South Africa"],
    ["safrica", "South Africa"],
    ["b and h", "Bosnia and Herzegovina"],
    ["bandh", "Bosnia and Herzegovina"],
    ["czech r", "Czech Republic"],

    // England - Premier League
    ["coventry", "Coventry City"],
    ["hull", "Hull City"],
    ["manchester utd", "Manchester United"],
    ["nottingham", "Nottingham Forest"],
    ["leeds", "Leeds United"],
    ["tottenham", "Tottenham Hotspur"],
    ["brighton", "Brighton and Hove Albion"],
    ["brighton and hove albion", "Brighton and Hove Albion"],
    ["ipswich", "Ipswich Town"],
    ["newcastle", "Newcastle United"],
    ["bournemouth afc", "Bournemouth"],

    // Germany - Bundesliga
    ["bayern", "Bayern Munich"],
    ["bayern munchen", "Bayern Munich"],
    ["vfb stuttgart", "Stuttgart"],
    ["schalke", "Schalke 04"],
    ["m'gladbach", "Borussia Monchengladbach"],
    ["mainz", "Mainz 05"],
    ["fsv mainz 05", "Mainz 05"],
    ["frankfurt", "Eintracht Frankfurt"],
    ["sc freiburg", "Freiburg"],
    ["werder", "Werder Bremen"],
    ["koln", "FC Koln"],
    ["tsg hoffenheim", "Hoffenheim"],
    ["sv elversberg", "Elversberg"],
    ["leverkusen", "Bayer Leverkusen"],
    ["dortmund", "Borussia Dortmund"],
    ["hamburger", "Hamburger SV"],

    // France - Ligue 1
    ["olympique marseille", "Marseille"],
    ["olympique lyon", "Lyon"],
    ["as monaco", "Monaco"],
    ["psg", "Paris Saint-Germain"],
    ["paris saint germain", "Paris Saint-Germain"],

    // Italy - Serie A
    ["torino fc", "Torino"],
    ["milan", "AC Milan"],
    ["as roma", "Roma"],
    ["inter", "Internazionale"],
    ["inter milano", "Internazionale"],
    ["inter milan", "Internazionale"],
    ["monza brianza", "Monza"],

    // Spain - LaLiga
    ["rcd espanyol", "Espanyol"],
    ["betis", "Real Betis"],
    ["ath bilbao", "Athletic Bilbao"],
    ["celta", "Celta Vigo"],
    ["atl madrid", "Atletico Madrid"],
    ["la coruna", "Deportivo La Coruna"],
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

async function fetchJson(url, timeoutMs = FEED_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

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
    if (error.name === "AbortError") throw new Error(`Request timed out after ${timeoutMs} ms.`);
    throw error.message?.startsWith("HTTP ") ? error : new Error(`Invalid JSON: ${error.message}`);
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchJsonWithRetry(url, { attempts = 2, timeoutMs = FEED_TIMEOUT_MS } = {}) {
  let latestError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fetchJson(url, timeoutMs);
    } catch (error) {
      latestError = error;
      if (attempt === attempts) break;
    }
  }

  throw latestError;
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

function getPinnacleCompetitionLeagueIds(leaguesPayload, competition) {
  if (PINNACLE_LEAGUE_IDS.length) return PINNACLE_LEAGUE_IDS;
  return getPinnacleLeagues(leaguesPayload)
    .filter(
      (league) =>
        String(league.leagueCode) === competition.pinnacleLeagueCode ||
        textIncludesTerms([league.name, league.englishName, league.leagueCode].join(" "), competition.terms || []),
    )
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

async function fetchSseSnapshot(url, timeoutMs = FEED_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let onAbort;
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

    onAbort = () => {
      reader.cancel().catch(() => {});
    };
    controller.signal.addEventListener("abort", onAbort);
    if (controller.signal.aborted) {
      onAbort();
    }

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

    if (controller.signal.aborted) {
      throw new Error(`Request timed out after ${FEED_TIMEOUT_MS} ms.`);
    }

    buffer += decoder.decode();
    const data = extractFirstSseData(buffer);
    if (!data) throw new Error("SSE snapshot did not include a data event.");
    return JSON.parse(data);
  } finally {
    if (onAbort) {
      controller.signal.removeEventListener("abort", onAbort);
    }
    clearTimeout(timeout);
  }
}


function matchesMozzartCompetition(item, competition) {
  const home = item.participants?.[0]?.name;
  const away = item.participants?.[1]?.name;
  const competitionName = String(item.competition?.name || "");
  const joined = [competitionName, home, away].join(" ");
  if (textIncludesWomensCompetition(joined)) return false;

  if (competition.mozzartCountryTerm && competition.mozzartLeagueTerm) {
    const lower = competitionName.toLocaleLowerCase("sr-RS");
    return lower.includes(competition.mozzartCountryTerm) && lower.includes(competition.mozzartLeagueTerm);
  }

  return textIncludesTerms(joined, competition.terms);
}

async function fetchMozzartbetMatches(bookmaker, competition, timeoutMs = FEED_TIMEOUT_MS) {
  const urlOffer = "https://www.mozzartbet.ng/betOffer2";
  const urlOdds = "https://www.mozzartbet.ng/getBettingOdds";

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const offerPayload = {
      date: "all",
      sportIds: [1],
      competitionIds: [],
      sort: "bycompetition",
      size: 1000,
      type: "betting",
      lang: "en",
      offset: 0
    };

    const offerResponse = await fetch(urlOffer, {
      method: "POST",
      signal: controller.signal,
      headers: {
        accept: "application/json, text/plain, */*",
        "content-type": "application/json",
        origin: "https://www.mozzartbet.ng",
        "user-agent": "Mozilla/5.0",
      },
      body: JSON.stringify(offerPayload),
    });

    if (!offerResponse.ok) {
      const text = await offerResponse.text();
      throw new Error(`HTTP ${offerResponse.status}: ${text.slice(0, 150)}`);
    }

    const offerData = await offerResponse.json();
    const allItems = Array.isArray(offerData?.matches) ? offerData.matches : [];

    const competitionItems = allItems.filter((match) => matchesMozzartCompetition(match, competition));

    let oddsData = [];
    if (competitionItems.length > 0) {
      const matchIds = competitionItems.map(m => m.id);
      
      // MozzartBet NG limits getBettingOdds requests, fetch in chunks of 30 concurrently
      const fetchPromises = [];
      for (let i = 0; i < matchIds.length; i += 30) {
        const chunk = matchIds.slice(i, i + 30);
        const oddsPayload = {
          matchIds: chunk,
          subgames: [1001001001, 1001001002, 1001001003, 1001003002, 1001003004, 1001089001, 1001089003]
        };

        fetchPromises.push(
          fetch(urlOdds, {
            method: "POST",
            signal: controller.signal,
            headers: {
              accept: "application/json, text/plain, */*",
              "content-type": "application/json",
              origin: "https://www.mozzartbet.ng",
              "user-agent": "Mozilla/5.0",
            },
            body: JSON.stringify(oddsPayload),
          }).then(async res => {
            if (!res.ok) {
              const text = await res.text();
              throw new Error(`HTTP ${res.status}: ${text.slice(0, 150)}`);
            }
            return res.json();
          })
        );
      }
      
      const chunksData = await Promise.all(fetchPromises);
      chunksData.forEach(chunkData => {
        if (Array.isArray(chunkData)) {
          oddsData.push(...chunkData);
        }
      });
    }

    const oddsById = {};
    if (Array.isArray(oddsData)) {
      oddsData.forEach(o => oddsById[o.id] = o.kodds || {});
    }

    const matches = competitionItems.map(item => {
      const home = item.participants?.[0]?.name || "";
      const away = item.participants?.[1]?.name || "";
      const kickOffTime = Number(item.startTime) || null;
      const kodds = oddsById[item.id] || {};

      const getOdd = (subgameId) => kodds[subgameId]?.value ? Number(kodds[subgameId].value) : null;

      const homeOdd = getOdd("1001001001");
      const drawOdd = getOdd("1001001002");
      const awayOdd = getOdd("1001001003");

      const over25 = getOdd("1001003004");
      const under25 = getOdd("1001003002");

      const homeQualify = getOdd("1001089001");
      const awayQualify = getOdd("1001089003");

      const totalsByLine = emptyTotalsByLine();
      if (over25 !== null || under25 !== null) {
        setTotalsLine(totalsByLine, 2.5, { over: over25, under: under25 });
      }

      return {
        bookmakerId: bookmaker.id,
        bookmakerName: bookmaker.name,
        source: bookmaker.type,
        matchKey: createMatchKey(home, away, kickOffTime),
        externalId: item.id,
        matchCode: item.matchNumber,
        home: normalizeTeamName(home),
        away: normalizeTeamName(away),
        leagueName: normalizeCompetitionName(item.competition?.name) || competition.label,
        leagueGroup: String(item.competition?.id || ""),
        kickOffTime,
        updatedAt: Date.now(),
        odds: {
          home: homeOdd,
          draw: drawOdd,
          away: awayOdd,
        },
        totalsByLine,
        qualifyOdds: { home: homeQualify, away: awayQualify },
      };
    });

    return {
      bookmaker,
      status: "ok",
      url: urlOffer,
      matches,
      fetchedAt: Date.now(),
      totalMatches: matches.length,
    };
  } catch (err) {
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}


async function getMozzartbetFeed(bookmaker, competition) {
  const entry = getCacheEntry(mozzartbetCache, competition.id);
  const now = Date.now();
  if (entry.result && entry.expiresAt > now) {
    return {
      ...entry.result,
      cached: true,
      message: entry.result.message || "Using cached Mozzartbet feed.",
    };
  }

  if (!entry.promise) {
    entry.promise = fetchMozzartbetMatches(bookmaker, competition)
      .then((result) => {
        entry.result = result;
        entry.expiresAt = Date.now() + 60000;
        return result;
      })
      .catch((error) => {
        const errorResult = {
          bookmaker,
          status: "error",
          url: "https://www.mozzartbet.com/betting/matches",
          matches: [],
          message: error.message,
        };
        entry.result = errorResult;
        entry.expiresAt = Date.now() + 180000; // Cache failures for 3 minutes to cool down
        return errorResult;
      })
      .finally(() => {
        entry.promise = null;
      });
  }

  return entry.promise;
}

async function fetchOddsmathMatches(competition) {
  const leagueId = competition.oddsmathLeagueId;
  const leagueUrl = `https://www.oddsmath.com/api/v1/events-by-league.json/?language=en&country_code=RS&league_id=${leagueId}`;

  const leaguePayload = await fetchJson(leagueUrl);
  const events = [];
  if (leaguePayload?.data) {
    for (const dateKey of Object.keys(leaguePayload.data)) {
      const dateObj = leaguePayload.data[dateKey];
      if (dateObj?.events) {
        for (const eventId of Object.keys(dateObj.events)) {
          const ev = dateObj.events[eventId];
          events.push({
            id: eventId,
            home: ev.hometeam_name,
            away: ev.awayteam_name,
            time: ev.time,
          });
        }
      }
    }
  }

  const matches = [];
  const btfoddsData = await fetchBtfOdds(competition);
  
  const chunkSize = 15;
  for (let i = 0; i < events.length; i += chunkSize) {
    const chunk = events.slice(i, i + chunkSize);
    const promises = chunk.map(async (event) => {
      const url0 = `https://www.oddsmath.com/api/v1/live-odds.json/?event_id=${event.id}&cat_id=0&include_exchanges=1&language=en&country_code=RS`;
      const url6 = `https://www.oddsmath.com/api/v1/live-odds.json/?event_id=${event.id}&cat_id=6&include_exchanges=1&language=en&country_code=RS`;
      try {
        const [res0, res6] = await Promise.all([
          fetchJson(url0),
          fetchJson(url6),
        ]);
        const eventData0 = res0?.data || {};
        const eventData6 = res6?.data || {};

        const biaLive = eventData0.BetInAsia?.live;
        const biaOdds = biaLive ? {
          home: normalizePrice(biaLive['1'] || biaLive[1]),
          draw: normalizePrice(biaLive['X'] || biaLive['x']),
          away: normalizePrice(biaLive['2'] || biaLive[2]),
        } : { home: null, draw: null, away: null };

        const biaLive6 = eventData6.BetInAsia?.live;
        const biaTotals = biaLive6 ? {
          over: normalizePrice(biaLive6.O || biaLive6.o),
          under: normalizePrice(biaLive6.U || biaLive6.u),
        } : { over: null, under: null };

        const bfLay = eventData0.Betfair?.live_exchange_lay;
        const bfOdds = bfLay ? {
          home: normalizePrice(bfLay['1'] || bfLay[1]),
          draw: normalizePrice(bfLay['X'] || bfLay['x']),
          away: normalizePrice(bfLay['2'] || bfLay[2]),
        } : { home: null, draw: null, away: null };

        const bfLay6 = eventData6.Betfair?.live_exchange_lay;
        const bfTotals = bfLay6 ? {
          over: normalizePrice(bfLay6.O || bfLay6.o),
          under: normalizePrice(bfLay6.U || bfLay6.u),
        } : { over: null, under: null };

        const kickOffTime = event.time ? new Date(event.time + "Z").getTime() : null;
        const matchKeyForBtf = createMatchKey(event.home, event.away, null);

        let bfMoneyFlow = null;
        let bfMoneyFlowHistory = [];
        if (btfoddsData && btfoddsData[matchKeyForBtf]) {
          const btf = btfoddsData[matchKeyForBtf];
          bfMoneyFlow = {
            home: btf.home,
            draw: btf.draw,
            away: btf.away
          };
          bfMoneyFlowHistory = btfoddsCache.history[matchKeyForBtf] || [];
        } else {
          // Fallback to oddsmath if btfodds didn't have it
          const bfBack = eventData0.Betfair?.live_exchange_back;
          bfMoneyFlow = bfBack ? {
            home: Number(bfBack.amount_1 || 0),
            draw: Number(bfBack.amount_X || 0),
            away: Number(bfBack.amount_2 || 0)
          } : null;

          const bfBackHistoryRaw = eventData0.Betfair?.history_exchange_back || [];
          bfMoneyFlowHistory = bfBackHistoryRaw.map(item => ({
            updated: item.updated,
            home: Number(item.amount_1 || 0),
            draw: Number(item.amount_X || 0),
            away: Number(item.amount_2 || 0)
          }));
        }

        matches.push({
          eventId: event.id,
          home: normalizeTeamName(event.home),
          away: normalizeTeamName(event.away),
          kickOffTime,
          biaOdds,
          biaTotals,
          bfOdds,
          bfTotals,
          bfMoneyFlow,
          bfMoneyFlowHistory,
        });
      } catch (err) {
        console.warn(`Failed to fetch live odds for event ${event.id}:`, err.message);
      }
    });
    await Promise.all(promises);
  }

  return {
    url: leagueUrl,
    matches,
    fetchedAt: Date.now(),
    totalMatches: events.length,
  };
}

function getOddsmathMatchesForBookmaker(bookmaker, allOddsmathMatches, competition) {
  return allOddsmathMatches.map((item) => {
    const isBia = bookmaker.id === "betinasia";
    const odds = isBia ? item.biaOdds : item.bfOdds;
    const totals = isBia ? item.biaTotals : item.bfTotals;

    const totalsByLine = emptyTotalsByLine();
    if (totals.over !== null || totals.under !== null) {
      setTotalsLine(totalsByLine, 2.5, totals);
    }

    return {
      bookmakerId: bookmaker.id,
      bookmakerName: bookmaker.name,
      source: bookmaker.type,
      isReference: Boolean(bookmaker.isReference),
      matchKey: createMatchKey(item.home, item.away, item.kickOffTime),
      externalId: item.eventId,
      matchCode: null,
      home: item.home,
      away: item.away,
      leagueName: competition.label,
      leagueGroup: String(competition.oddsmathLeagueId),
      kickOffTime: item.kickOffTime,
      updatedAt: Date.now(),
      odds,
      totalsByLine,
      bfMoneyFlow: bookmaker.id === "betfair_lay" ? item.bfMoneyFlow : undefined,
      bfMoneyFlowHistory: bookmaker.id === "betfair_lay" ? item.bfMoneyFlowHistory : undefined,
    };
  });
}

async function getOddsmathFeed(bookmaker, competition) {
  const entry = getCacheEntry(oddsmathCache, competition.id);
  const now = Date.now();
  if (entry.result && entry.expiresAt > now) {
    const matches = getOddsmathMatchesForBookmaker(bookmaker, entry.result.matches, competition);
    return {
      bookmaker,
      status: "ok",
      url: entry.result.url,
      matches,
      fetchedAt: entry.result.fetchedAt,
      totalMatches: entry.result.totalMatches,
      cached: true,
      message: "Using cached Oddsmath feed.",
    };
  }

  if (!entry.promise) {
    entry.promise = fetchOddsmathMatches(competition)
      .then((result) => {
        entry.result = result;
        entry.expiresAt = Date.now() + 60000;
        return result;
      })
      .catch((error) => {
        entry.promise = null;
        throw error;
      })
      .finally(() => {
        entry.promise = null;
      });
  }

  try {
    const result = await entry.promise;
    const matches = getOddsmathMatchesForBookmaker(bookmaker, result.matches, competition);
    return {
      bookmaker,
      status: "ok",
      url: result.url,
      matches,
      fetchedAt: result.fetchedAt,
      totalMatches: result.totalMatches,
    };
  } catch (error) {
    return {
      bookmaker,
      status: "error",
      url: "https://www.oddsmath.com",
      matches: [],
      message: error.message,
    };
  }
}

async function fetchBookmaker(bookmaker, competition) {
  if (bookmaker.type === "pinnacle") {
    let url = pinnacleLeagueOddsUrl(competition.pinnacleLeagueCode || PINNACLE_LEAGUE_CODE);

    try {
      if (PINNACLE_USE_LEAGUES_LOOKUP) {
        const leaguesUrl = pinnacleLeaguesUrl();
        url = leaguesUrl;
        const leaguesPayload = await fetchPinnacleJson(leaguesUrl);
        const leagueIds = getPinnacleCompetitionLeagueIds(leaguesPayload, competition);
        const matchedLeague = getPinnacleLeagues(leaguesPayload).find((league) =>
          leagueIds.includes(String(league.id)),
        );

        if (!leagueIds.length) {
          return {
            bookmaker,
            status: "configured",
            url: leaguesUrl,
            matches: [],
            totalMatches: getPinnacleLeagues(leaguesPayload).length,
            message: `Pinnacle leagues feed is enabled, but no ${competition.label} league was found.`,
          };
        }

        url = pinnacleLeagueOddsUrl(matchedLeague?.leagueCode || competition.pinnacleLeagueCode || PINNACLE_LEAGUE_CODE);
      }

      const oddsPayload = await fetchPinnacleJson(url);
      const matches = normalizePinnacleMatches(bookmaker, oddsPayload, oddsPayload, competition);
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
      const payload = await fetchJsonWithRetry(url, {
        attempts: bookmaker.id === "maxbet" ? 3 : 2,
        timeoutMs: bookmaker.id === "maxbet" ? Math.max(FEED_TIMEOUT_MS, 15000) : FEED_TIMEOUT_MS,
      });
      const matches = normalizeDualsoftMatches(bookmaker, payload, competition);
      await enrichDualsoftWithQualifyOdds(bookmaker, matches);
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
    const url = nsoftCompetitionUrl(bookmaker, competition);
    try {
      const payload = await fetchJson(url);
      const matches = normalizeNsoftMatches(bookmaker, payload, competition);
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
    const url = superbetCompetitionUrl(bookmaker, competition);
    try {
      const payload = await fetchSseSnapshot(url);
      const events = Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : [];
      const matches = normalizeSuperbetMatches(bookmaker, events, competition);
      return {
        bookmaker,
        status: "ok",
        url,
        matches,
        fetchedAt: Date.now(),
        totalMatches: events.length,
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

  if (bookmaker.type === "mozzartbet") {
    return getMozzartbetFeed(bookmaker, competition);
  }

  if (bookmaker.type === "oddsmath") {
    return getOddsmathFeed(bookmaker, competition);
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
        totalsByLine: emptyTotalsByLine(),
        qualifyOdds: { home: null, away: null },
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
    goalsLine: null,
    sourceOfTruth: truthSource?.bookmakerId || null,
    sourceExternalId: truthSource?.externalId || null,
    bookmakers: emptyBookmakerMap(),
  };
}

function hasAnyValidOdds(entry) {
  if (!entry) return false;
  const odds = entry.odds;
  if (odds && (isValidDecimalOdd(odds.home) || isValidDecimalOdd(odds.draw) || isValidDecimalOdd(odds.away))) {
    return true;
  }
  if (entry.totals25 && (isValidDecimalOdd(entry.totals25.over) || isValidDecimalOdd(entry.totals25.under))) {
    return true;
  }
  if (entry.totalsByLine) {
    for (const lineObj of Object.values(entry.totalsByLine)) {
      if (isValidDecimalOdd(lineObj?.over) || isValidDecimalOdd(lineObj?.under)) {
        return true;
      }
    }
  }
  return false;
}

function attachOffer(row, offer) {
  const existing = row.bookmakers[offer.bookmakerId];
  const offerTime = Number(offer.kickOffTime || 0);
  const rowTime = Number(row.kickOffTime || 0);
  const newDiff = Math.abs(offerTime - rowTime);

  if (existing && existing.updatedAt !== null) {
    const existingHasOdds = hasAnyValidOdds(existing);
    const newHasOdds = hasAnyValidOdds(offer);

    if (existingHasOdds && !newHasOdds) {
      return;
    }
    if (!existingHasOdds && newHasOdds) {
      // Overwrite empty/null existing odds with valid new odds
    } else {
      const existingDiff = existing.timeDiff !== undefined ? existing.timeDiff : Infinity;
      if (newDiff >= existingDiff) {
        return;
      }
    }
  }

  row.bookmakers[offer.bookmakerId] = {
    bookmakerId: offer.bookmakerId,
    bookmakerName: offer.bookmakerName,
    isReference: Boolean(offer.isReference),
    odds: offer.odds,
    totalsByLine: offer.totalsByLine || emptyTotalsByLine(),
    totals25: offer.totals25 || emptyTotals25(),
    qualifyOdds: offer.qualifyOdds || { home: null, away: null },
    updatedAt: offer.updatedAt,
    externalId: offer.externalId,
    timeDiff: newDiff,
    bfMoneyFlow: offer.bfMoneyFlow,
    bfMoneyFlowHistory: offer.bfMoneyFlowHistory,
  };
}

function findTruthRow(byMatch, offer) {
  const exact = byMatch.get(offer.matchKey);
  if (exact) return exact;

  const offerHome = simplifyTeam(offer.home);
  const offerAway = simplifyTeam(offer.away);
  const offerTime = Number(offer.kickOffTime || 0);

  for (const row of byMatch.values()) {
    const rowHome = simplifyTeam(row.home);
    const rowAway = simplifyTeam(row.away);
    const sameTeams =
      (rowHome === offerHome && rowAway === offerAway) ||
      (rowHome === offerAway && rowAway === offerHome);
    if (!sameTeams) continue;

    const rowTime = Number(row.kickOffTime || 0);
    // Use an 8-day threshold (8 * 24 * 60 * 60 * 1000) to consolidate matches with feed date discrepancies
    if (!rowTime || !offerTime || Math.abs(rowTime - offerTime) <= 8 * 24 * 60 * 60 * 1000) {
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

function hasCompleteTotals(totals) {
  return isValidDecimalOdd(totals?.over) && isValidDecimalOdd(totals?.under);
}

function chooseGoalsLine(match) {
  const pinnacleTotals = match.bookmakers.pinnacle?.totalsByLine || {};
  if (hasCompleteTotals(totalsForLine(pinnacleTotals, 2.5))) return 2.5;
  if (hasCompleteTotals(totalsForLine(pinnacleTotals, 3.5))) return 3.5;

  const fallbackTotals = match.bookmakers[NO_VIG_FALLBACK_BOOKMAKER]?.totalsByLine || {};
  if (hasCompleteTotals(totalsForLine(fallbackTotals, 2.5))) return 2.5;
  if (hasCompleteTotals(totalsForLine(fallbackTotals, 3.5))) return 3.5;

  for (const entry of Object.values(match.bookmakers)) {
    if (entry.isReference) continue;
    if (hasCompleteTotals(totalsForLine(entry.totalsByLine, 2.5))) return 2.5;
  }

  for (const entry of Object.values(match.bookmakers)) {
    if (entry.isReference) continue;
    if (hasCompleteTotals(totalsForLine(entry.totalsByLine, 3.5))) return 3.5;
  }

  return null;
}

function applySelectedGoalsLine(match) {
  const goalsLine = chooseGoalsLine(match);
  match.goalsLine = goalsLine;

  for (const entry of Object.values(match.bookmakers)) {
    entry.totals25 = goalsLine === null ? emptyTotals25() : totalsForLine(entry.totalsByLine, goalsLine);
  }
}

function applyPinnacleShinNoVig(match) {
  const pinnacle = match.bookmakers.pinnacle;
  const fallback = match.bookmakers[NO_VIG_FALLBACK_BOOKMAKER];
  const oddsSource =
    isValidDecimalOdd(pinnacle?.odds?.home) && isValidDecimalOdd(pinnacle?.odds?.draw) && isValidDecimalOdd(pinnacle?.odds?.away)
      ? pinnacle
      : fallback;
  const totalsSource =
    hasCompleteTotals(pinnacle?.totals25)
      ? pinnacle
      : hasCompleteTotals(fallback?.totals25)
        ? fallback
        : pinnacle;
  const [home, draw, away] = shinNoVigOdds([
    oddsSource?.odds?.home,
    oddsSource?.odds?.draw,
    oddsSource?.odds?.away,
  ]);
  const [over, under] = shinNoVigOdds([
    totalsSource?.totals25?.over,
    totalsSource?.totals25?.under,
  ]);

  const pinnacleQ = pinnacle?.qualifyOdds;
  const [qualifyHome, qualifyAway] =
    isValidDecimalOdd(pinnacleQ?.home) && isValidDecimalOdd(pinnacleQ?.away)
      ? shinNoVigOdds([pinnacleQ.home, pinnacleQ.away])
      : [null, null];

  match.bookmakers[PINNACLE_SHIN_BOOKMAKER.id] = {
    bookmakerId: PINNACLE_SHIN_BOOKMAKER.id,
    bookmakerName: PINNACLE_SHIN_BOOKMAKER.name,
    isReference: true,
    odds: { home, draw, away },
    totalsByLine: match.goalsLine === null ? emptyTotalsByLine() : { [String(match.goalsLine)]: { line: match.goalsLine, over, under } },
    totals25: { line: match.goalsLine, over, under },
    qualifyOdds: { home: qualifyHome, away: qualifyAway },
    updatedAt: oddsSource?.updatedAt || totalsSource?.updatedAt || null,
    externalId: oddsSource?.externalId || totalsSource?.externalId || null,
  };
}

function isOutright(home, away) {
  const h = String(home || "").trim();
  const a = String(away || "").trim();

  // If either home or away is empty, it's an outright/special market, not a match.
  if (!h || !a) return true;

  const hLower = h.toLowerCase();
  const aLower = a.toLowerCase();

  // Filter out exact group names or generic group/outright lines
  const groupPattern = /^(group|grupa)\s+[a-h]$/i;
  if (groupPattern.test(h) || groupPattern.test(a)) return true;

  const outrightKeywords = [
    "pobednik grupe",
    "winner of group",
    "group winner",
    "grupa pobednik",
    "outright",
    "pobednik prvenstva",
    "pobednik turnira",
    "tournament winner",
    "overall winner",
    "stage winner"
  ];

  if (outrightKeywords.some((keyword) => hLower.includes(keyword) || aLower.includes(keyword))) {
    return true;
  }

  return false;
}

function aggregateMatches(results) {
  // Filter out outrights/specials before aggregation
  for (const result of results) {
    if (result.matches) {
      result.matches = result.matches.filter(m => !isOutright(m.home, m.away));
    }
  }

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

        const isReversed = simplifyTeam(row.home) === simplifyTeam(offer.away);
        if (isReversed) {
          const adjustedOffer = {
            ...offer,
            odds: offer.odds ? {
              home: offer.odds.away,
              draw: offer.odds.draw,
              away: offer.odds.home,
            } : { home: null, draw: null, away: null },
            qualifyOdds: offer.qualifyOdds ? {
              home: offer.qualifyOdds.away,
              away: offer.qualifyOdds.home,
            } : { home: null, away: null },
          };
          attachOffer(row, adjustedOffer);
        } else {
          attachOffer(row, offer);
        }
        result.matchedMatches += 1;
      }
    }
  } else {
    for (const result of results) {
      for (const offer of result.matches) {
        const row = findTruthRow(byMatch, offer);
        if (row) {
          const isReversed = simplifyTeam(row.home) === simplifyTeam(offer.away);
          if (isReversed) {
            const adjustedOffer = {
              ...offer,
              odds: offer.odds ? {
                home: offer.odds.away,
                draw: offer.odds.draw,
                away: offer.odds.home,
              } : { home: null, draw: null, away: null },
              qualifyOdds: offer.qualifyOdds ? {
                home: offer.qualifyOdds.away,
                away: offer.qualifyOdds.home,
              } : { home: null, away: null },
            };
            attachOffer(row, adjustedOffer);
          } else {
            attachOffer(row, offer);
          }
        } else {
          const newRow = makeMatchRow(offer);
          attachOffer(newRow, offer);
          byMatch.set(offer.matchKey, newRow);
        }
      }
    }
  }

  const cutOffTime = Date.now();
  return Array.from(byMatch.values())
    .filter((match) => {
      if (!match.kickOffTime) return true;
      return Number(match.kickOffTime) >= cutOffTime;
    })
    .map((match) => {
      applySelectedGoalsLine(match);
      applyPinnacleShinNoVig(match);
      return {
        ...match,
        best: getBestOdds(match.bookmakers),
        bestTotals25: getBestTotals25(match.bookmakers),
        bestQualify: getBestQualifyOdds(match.bookmakers),
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

function getBestQualifyOdds(bookmakers) {
  const best = { home: { value: null, bookmakerId: null, bookmakerName: null }, away: { value: null, bookmakerId: null, bookmakerName: null } };
  for (const entry of Object.values(bookmakers || {})) {
    if (entry.isReference) continue;
    for (const side of ["home", "away"]) {
      const value = Number(entry.qualifyOdds?.[side]);
      if (isValidDecimalOdd(value) && (!best[side].value || value > best[side].value)) {
        best[side] = { value, bookmakerId: entry.bookmakerId, bookmakerName: entry.bookmakerName };
      }
    }
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

const COMPETITION_AVAILABILITY_TTL_MS = 10 * 60 * 1000;
const competitionAvailabilityCache = new Map();

async function checkCompetitionHasOffers(competition) {
  try {
    const url = pinnacleLeagueOddsUrl(competition.pinnacleLeagueCode || PINNACLE_LEAGUE_CODE);
    const payload = await fetchPinnacleJson(url);
    return getPinnacleEvents(payload).length > 0;
  } catch {
    return true; // treat lookup failures as "unknown" and keep the tab visible
  }
}

async function refreshStaleCompetitionAvailability(excludeId) {
  const now = Date.now();
  const stale = COMPETITIONS.filter((competition) => {
    if (competition.id === excludeId) return false;
    const entry = competitionAvailabilityCache.get(competition.id);
    return !entry || now - entry.checkedAt > COMPETITION_AVAILABILITY_TTL_MS;
  });

  await Promise.all(
    stale.map(async (competition) => {
      const hasOffers = await checkCompetitionHasOffers(competition);
      competitionAvailabilityCache.set(competition.id, { hasOffers, checkedAt: Date.now() });
    }),
  );
}

function resolveDefaultCompetitionId() {
  for (const competition of COMPETITIONS) {
    const entry = competitionAvailabilityCache.get(competition.id);
    if (!entry || entry.hasOffers !== false) return competition.id;
  }
  return DEFAULT_COMPETITION_ID;
}

export async function getOddsPayload(competitionId) {
  const competition = getCompetitionById(competitionId || resolveDefaultCompetitionId());
  const startedAt = Date.now();
  const settled = await Promise.all(FEED_BOOKMAKERS.map((bookmaker) => fetchBookmaker(bookmaker, competition)));
  const matches = aggregateMatches(settled);

  competitionAvailabilityCache.set(competition.id, { hasOffers: matches.length > 0, checkedAt: Date.now() });
  await refreshStaleCompetitionAvailability(competition.id);

  return {
    generatedAt: Date.now(),
    elapsedMs: Date.now() - startedAt,
    activeCompetitionId: competition.id,
    competitions: COMPETITIONS.map(({ id, label }) => ({
      id,
      label,
      hasOffers: competitionAvailabilityCache.get(id)?.hasOffers ?? true,
    })),
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
      competition: competition.label,
      terms: competition.terms || [],
      note:
        matches.length === 0
          ? `No ${competition.label}-labelled matches were returned by the enabled feeds yet.`
          : null,
    },
  };
}

export function getHealthPayload() {
  return { ok: true, bookmakers: DISPLAY_BOOKMAKERS.length };
}

async function handleOdds(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const competitionId = url.searchParams.get("competition") || undefined;
  sendJson(res, 200, await getOddsPayload(competitionId));
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
    console.log(`Fudbal Kvote running on http://localhost:${PORT}`);
  });
}
