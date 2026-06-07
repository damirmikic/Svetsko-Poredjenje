import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(__dirname, "public");

const PORT = Number(process.env.PORT || 3000);
const DUALSOFT_VERSION = process.env.DUALSOFT_VERSION || "2.44.3.18";
const LOCALE = "sr";
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

const BOOKMAKERS = [
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
    id: "mozzart",
    name: "Mozzart",
    type: "configured",
    baseUrl: "https://betting-publisher-rs.mozzartio.com/betting-publisher/ws-broker",
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

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

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

function textIncludesWorldCup(value) {
  const haystack = String(value || "").toLocaleLowerCase("sr-RS");
  return WORLD_CUP_TERMS.some((term) => haystack.includes(term));
}

function isWorldCupMatch(match) {
  const joined = [
    match.leagueName,
    match.leagueToken,
    match.leagueGroupToken,
    match.home,
    match.away,
  ].join(" ");

  return textIncludesWorldCup(joined);
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

function normalizeNsoftMatches(bookmaker, payload) {
  const events = Array.isArray(payload?.data?.events) ? payload.data.events : [];

  return events
    .filter((event) => Number(event.f) === Number(bookmaker.tournamentId) || textIncludesWorldCup(event.g))
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

function normalizeSuperbetMatches(bookmaker, payload) {
  const events = Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : [];

  return events
    .filter((event) => SUPERBET_WORLD_CUP_TOURNAMENTS.includes(String(event.fixture?.tournament_id)))
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
    ["bosnia and herz", "Bosnia and Herzegovina"],
    ["bosna i hercegovina", "Bosnia and Herzegovina"],
    ["czech rep", "Czech Republic"],
    ["czechia", "Czech Republic"],
    ["ceska", "Czech Republic"],
    ["ceska r", "Czech Republic"],
    ["congo dr", "D.R. Congo"],
    ["d r congo", "D.R. Congo"],
    ["dr kongo", "D.R. Congo"],
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
  const response = await fetch(url, {
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

  try {
    return parseJsonPayload(text);
  } catch (error) {
    throw new Error(`Invalid JSON: ${text.slice(0, 180)}`);
  }
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
  const timeout = setTimeout(() => controller.abort(), 15000);

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

async function fetchBookmaker(bookmaker) {
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
    BOOKMAKERS.map((bookmaker) => [
      bookmaker.id,
      {
        bookmakerId: bookmaker.id,
        bookmakerName: bookmaker.name,
        odds: { home: null, draw: null, away: null },
        updatedAt: null,
        externalId: null,
      },
    ]),
  );
}

function compareOdds(a, b) {
  return (Number(b || 0) - Number(a || 0)).toFixed(2);
}

function aggregateMatches(results) {
  const byMatch = new Map();

  for (const result of results) {
    for (const offer of result.matches) {
      if (!byMatch.has(offer.matchKey)) {
        byMatch.set(offer.matchKey, {
          matchKey: offer.matchKey,
          home: offer.home,
          away: offer.away,
          leagueName: offer.leagueName,
          kickOffTime: offer.kickOffTime,
          bookmakers: emptyBookmakerMap(),
        });
      }

      const row = byMatch.get(offer.matchKey);
      row.bookmakers[offer.bookmakerId] = {
        bookmakerId: offer.bookmakerId,
        bookmakerName: offer.bookmakerName,
        odds: offer.odds,
        updatedAt: offer.updatedAt,
        externalId: offer.externalId,
      };
    }
  }

  return Array.from(byMatch.values())
    .map((match) => ({
      ...match,
      best: getBestOdds(match.bookmakers),
      margin: estimateBestMargin(match.bookmakers),
    }))
    .sort((a, b) => Number(a.kickOffTime || 0) - Number(b.kickOffTime || 0));
}

function getBestOdds(bookmakers) {
  const outcomes = ["home", "draw", "away"];
  const best = {};

  for (const outcome of outcomes) {
    let top = { value: null, bookmakerId: null, bookmakerName: null };
    for (const entry of Object.values(bookmakers)) {
      const value = entry.odds?.[outcome];
      if (Number.isFinite(Number(value)) && (!top.value || Number(value) > top.value)) {
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

async function handleOdds(req, res) {
  const startedAt = Date.now();
  const settled = await Promise.all(BOOKMAKERS.map(fetchBookmaker));
  const matches = aggregateMatches(settled);

  sendJson(res, 200, {
    generatedAt: Date.now(),
    elapsedMs: Date.now() - startedAt,
    bookmakers: BOOKMAKERS.map(({ id, name, type, baseUrl }) => ({ id, name, type, baseUrl })),
    feeds: settled.map((result) => ({
      bookmakerId: result.bookmaker.id,
      bookmakerName: result.bookmaker.name,
      status: result.status,
      url: result.url,
      totalMatches: result.totalMatches || 0,
      worldCupMatches: result.matches.length,
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
  });
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

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === "/api/odds") {
      await handleOdds(req, res);
      return;
    }

    if (url.pathname === "/api/health") {
      sendJson(res, 200, { ok: true, bookmakers: BOOKMAKERS.length });
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
