const bookmakerOrder = [
  "pinnacle_shin",
  "pinnacle",
  "merkurxtip",
  "maxbet",
  "superbet",
  "balkanbet",
  "soccerbet",
];
const primaryReferenceBookmaker = "pinnacle_shin";
const fallbackReferenceBookmaker = "pinnacle";
const pinnacleBrowserBase = "https://www.pinnacle888.com/sports-service/sv/euro";
const pinnacleBrowserSportId = 29;
const pinnacleBrowserLeagueCode = "fifa-world-cup";
const matchWinnerOutcomes = ["home", "draw", "away"];
const todayOutcomes = [...matchWinnerOutcomes, "over25", "under25"];
const marketLabels = {
  home: "1",
  draw: "X",
  away: "2",
  over25: "2.5+",
  under25: "2.5-",
};

const state = {
  data: null,
  enabledBookmakers: new Set(bookmakerOrder),
  search: "",
  view: "all",
  noVigLimitPercent: 1,
};
const oddsRefreshMs = 30_000;
let isLoadingOdds = false;
let nextRefreshAt = Date.now() + oddsRefreshMs;

const els = {
  refreshButton: document.querySelector("#refreshButton"),
  refreshCountdown: document.querySelector("#refreshCountdown"),
  viewButtons: document.querySelectorAll(".segmented button[data-view]"),
  bookmakerToggles: document.querySelector("#bookmakerToggles"),
  searchInput: document.querySelector("#searchInput"),
  noVigLimitInput: document.querySelector("#noVigLimitInput"),
  noVigLimitValue: document.querySelector("#noVigLimitValue"),
  matchesCount: document.querySelector("#matchesCount"),
  activeFeeds: document.querySelector("#activeFeeds"),
  bestMargin: document.querySelector("#bestMargin"),
  updatedAt: document.querySelector("#updatedAt"),
  tableTitle: document.querySelector("#tableTitle"),
  resultNote: document.querySelector("#resultNote"),
  oddsHead: document.querySelector("#oddsHead"),
  oddsBody: document.querySelector("#oddsBody"),
  oddsTable: document.querySelector(".odds-table"),
};

function formatOdd(value) {
  if (value === null || value === undefined || value === "") return "-";
  return Number.isFinite(Number(value)) ? Number(value).toFixed(2) : "-";
}

function formatTime(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("sr-RS", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat("sr-RS", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

function todayMatchWindow() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  end.setHours(7, 0, 0, 0);

  return { start: start.getTime(), end: end.getTime() };
}

function isTodayMatch(match) {
  const kickOffTime = Number(match.kickOffTime);
  if (!Number.isFinite(kickOffTime)) return false;

  const { start, end } = todayMatchWindow();
  return kickOffTime >= start && kickOffTime < end;
}

async function loadOdds() {
  if (isLoadingOdds) return;
  isLoadingOdds = true;
  nextRefreshAt = Date.now() + oddsRefreshMs;
  renderRefreshCountdown();
  setLoading(true);
  try {
    const response = await fetch("/api/odds", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.data = await response.json();
    try {
      await hydratePinnacleFromBrowser();
    } catch (error) {
      console.warn("Pinnacle browser fallback failed:", error);
    }
    render();
  } catch (error) {
    els.resultNote.textContent = `Greska pri ucitavanju: ${error.message}`;
  } finally {
    setLoading(false);
    isLoadingOdds = false;
  }
}

function setLoading(isLoading) {
  els.refreshButton.disabled = isLoading;
  els.refreshButton.classList.toggle("is-loading", isLoading);
}

function renderRefreshCountdown() {
  const seconds = Math.max(0, Math.ceil((nextRefreshAt - Date.now()) / 1000));
  els.refreshCountdown.textContent = `${seconds}s`;
}

function refreshOddsOnTimer() {
  nextRefreshAt = Date.now() + oddsRefreshMs;
  renderRefreshCountdown();
  loadOdds();
}

function renderBookmakerToggles() {
  const bookmakers = state.data?.bookmakers || bookmakerOrder.map((id) => ({ id, name: id }));
  els.bookmakerToggles.innerHTML = bookmakers
    .map((bookmaker) => {
      const checked = state.enabledBookmakers.has(bookmaker.id) ? "checked" : "";
      return `
        <label class="toggle-row">
          <input type="checkbox" data-bookmaker="${bookmaker.id}" ${checked} />
          <span>${bookmaker.name}</span>
        </label>
      `;
    })
    .join("");

  els.bookmakerToggles.querySelectorAll("input").forEach((input) => {
    input.addEventListener("change", () => {
      if (input.checked) state.enabledBookmakers.add(input.dataset.bookmaker);
      else state.enabledBookmakers.delete(input.dataset.bookmaker);
      render();
    });
  });
}

function visibleMatches() {
  const query = state.search.trim().toLocaleLowerCase("sr-RS");
  const matches = state.data?.matches || [];
  return matches.filter((match) => {
    if (state.view === "today" && !isTodayMatch(match)) return false;

    const haystack = `${match.home} ${match.away} ${match.leagueName}`.toLocaleLowerCase("sr-RS");
    return !query || haystack.includes(query);
  });
}

function renderView() {
  els.viewButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.view === state.view);
  });

  const titles = {
    all: "World Cup 2026 - 1X2 kvote",
    today: "Danasnji mecevi - 1X2 i golovi 2.5",
    groups: "World Cup 2026 - Grupe",
  };
  els.tableTitle.textContent = titles[state.view] || titles.all;
  els.oddsTable.classList.toggle("is-today", state.view === "today");
}

function activeOutcomes() {
  return state.view === "today" ? todayOutcomes : matchWinnerOutcomes;
}

function outcomeValue(entry, outcome) {
  if (outcome === "over25") return entry?.totals25?.over;
  if (outcome === "under25") return entry?.totals25?.under;
  return entry?.odds?.[outcome];
}

function outcomeBest(match, outcome) {
  if (outcome === "over25") return match.bestTotals25?.over;
  if (outcome === "under25") return match.bestTotals25?.under;
  return match.best?.[outcome];
}

function isValidOdd(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 1;
}

function normalizeTeamName(value) {
  const clean = String(value || "").replace(/\s+/g, " ").trim();
  const canonical = clean
    .toLocaleLowerCase("sr-RS")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, "and")
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim();
  const aliases = new Map([
    ["usa", "United States"],
    ["u s a", "United States"],
    ["united states of america", "United States"],
    ["korea republic", "South Korea"],
    ["czechia", "Czech Republic"],
    ["czech rep", "Czech Republic"],
    ["turkiye", "Turkey"],
    ["congo dr", "D.R. Congo"],
    ["d r congo", "D.R. Congo"],
    ["dr congo", "D.R. Congo"],
    ["drc", "D.R. Congo"],
    ["ivory coast", "Ivory Coast"],
    ["cote divoire", "Ivory Coast"],
  ]);
  return aliases.get(canonical) || clean;
}

function simplifyTeam(value) {
  return normalizeTeamName(value)
    .toLocaleLowerCase("sr-RS")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function createMatchKey(home, away, kickOffTime) {
  const timestamp = Number(kickOffTime);
  const day = Number.isFinite(timestamp) ? new Date(timestamp).toISOString().slice(0, 10) : "unknown";
  return `${day}:${simplifyTeam(home)}:${simplifyTeam(away)}`;
}

function normalizePrice(value) {
  const numeric = Number(value);
  return isValidOdd(numeric) ? Number(numeric.toFixed(3)) : null;
}

function getPinnacleEvents(payload) {
  if (Array.isArray(payload?.events)) return payload.events;
  if (Array.isArray(payload?.value)) return payload.value;
  if (Array.isArray(payload)) return payload;
  return (payload?.leagues || []).flatMap((league) =>
    (league.events || []).map((event) => ({
      ...event,
      leagueName: event.leagueName || league.name,
      leagueId: event.leagueId || league.id,
    })),
  );
}

function getPinnacleTeamNames(event) {
  if (Array.isArray(event.participants)) {
    const home = event.participants.find((item) =>
      String(item.alignment || item.type || "").toLocaleLowerCase("en-US") === "home",
    )?.name;
    const away = event.participants.find((item) =>
      String(item.alignment || item.type || "").toLocaleLowerCase("en-US") === "away",
    )?.name;
    if (home || away) return [home, away];
  }
  return [event.home || event.homeTeam || event.homeTeamName, event.away || event.awayTeam || event.awayTeamName];
}

function getPinnacleKickoff(event) {
  return event.time || event.starts || event.startTime || event.startDate || event.eventDate || event.cutoffAt;
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

function shinProbabilities(odds) {
  const prices = odds.map((value) => Number(value));
  if (prices.some((value) => !isValidOdd(value))) return null;
  const inverseOdds = prices.map((value) => 1 / value);
  const marketPercent = inverseOdds.reduce((sum, value) => sum + value, 0);
  if (marketPercent <= 1) return inverseOdds.map((value) => value / marketPercent);

  const shinSum = (z) =>
    inverseOdds.reduce(
      (sum, value) =>
        sum +
        (Math.sqrt(z * z + (4 * (1 - z) * value * value) / marketPercent) - z) / (2 * (1 - z)),
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
      (Math.sqrt(z * z + (4 * (1 - z) * value * value) / marketPercent) - z) / (2 * (1 - z)),
  );
}

function shinNoVigOdds(values) {
  const probabilities = shinProbabilities(values);
  if (!probabilities) return values.map(() => null);
  return probabilities.map((probability) =>
    Number.isFinite(probability) && probability > 0 ? Number((1 / probability).toFixed(3)) : null,
  );
}

function getBestOdds(bookmakers) {
  const best = {};
  for (const outcome of matchWinnerOutcomes) {
    let top = { value: null, bookmakerId: null, bookmakerName: null };
    for (const entry of Object.values(bookmakers || {})) {
      if (entry.isReference) continue;
      const value = Number(entry.odds?.[outcome]);
      if (isValidOdd(value) && (!top.value || value > top.value)) {
        top = { value, bookmakerId: entry.bookmakerId, bookmakerName: entry.bookmakerName };
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
  return Number(((values.reduce((sum, value) => sum + 1 / value, 0) - 1) * 100).toFixed(2));
}

function normalizePinnacleOffer(event) {
  const [home, away] = getPinnacleTeamNames(event);
  const kickOffTime = Number(getPinnacleKickoff(event));
  const moneyline = getPinnacleMoneyline(event);
  return {
    matchKey: createMatchKey(home, away, kickOffTime),
    externalId: event.id || event.eventId || event.event_id,
    odds: {
      home: normalizePrice(moneyline.home ?? moneyline.homePrice),
      draw: normalizePrice(moneyline.draw ?? moneyline.drawPrice),
      away: normalizePrice(moneyline.away ?? moneyline.awayPrice),
    },
  };
}

async function hydratePinnacleFromBrowser() {
  const pinnacleFeed = state.data?.feeds?.find((feed) => feed.bookmakerId === "pinnacle");
  const hasPinnacleOdds = (state.data?.matches || []).some((match) =>
    matchWinnerOutcomes.some((outcome) => isValidOdd(match.bookmakers?.pinnacle?.odds?.[outcome])),
  );
  if (!state.data || hasPinnacleOdds || pinnacleFeed?.status === "ok") return;

  const params = new URLSearchParams({
    sportId: String(pinnacleBrowserSportId),
    oddsType: "1",
    version: "0",
    timeStamp: String(Date.now()),
    periodNum: "-1",
    eSportCode: "",
    leagueCode: pinnacleBrowserLeagueCode,
    isHlE: "true",
    isLive: "false",
    eventType: "0",
    locale: "en_US",
    _: String(Date.now()),
    withCredentials: "true",
  });

  const response = await fetch(`${pinnacleBrowserBase}/odds/league?${params.toString()}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`Pinnacle browser fetch HTTP ${response.status}`);
  const payload = await response.json();
  const offers = new Map(getPinnacleEvents(payload).map((event) => {
    const offer = normalizePinnacleOffer(event);
    return [offer.matchKey, offer];
  }));

  for (const match of state.data.matches || []) {
    const offer = offers.get(match.matchKey);
    if (!offer) continue;
    match.bookmakers.pinnacle = {
      ...match.bookmakers.pinnacle,
      bookmakerId: "pinnacle",
      bookmakerName: "Pinnacle",
      odds: offer.odds,
      updatedAt: Date.now(),
      externalId: offer.externalId,
    };
    const [home, draw, away] = shinNoVigOdds([offer.odds.home, offer.odds.draw, offer.odds.away]);
    match.bookmakers.pinnacle_shin = {
      ...match.bookmakers.pinnacle_shin,
      bookmakerId: "pinnacle_shin",
      bookmakerName: "Pinnacle no-vig",
      isReference: true,
      odds: { home, draw, away },
      updatedAt: Date.now(),
      externalId: offer.externalId,
    };
    match.best = getBestOdds(match.bookmakers);
    match.margin = estimateBestMargin(match.bookmakers);
  }

  if (pinnacleFeed) {
    pinnacleFeed.status = "ok";
    pinnacleFeed.message = "Loaded in browser fallback.";
    pinnacleFeed.worldCupMatches = offers.size;
    pinnacleFeed.matchedMatches = state.data.matches.filter((match) =>
      matchWinnerOutcomes.some((outcome) => isValidOdd(match.bookmakers?.pinnacle?.odds?.[outcome])),
    ).length;
  }
}

function lowestMarketOdd(match, bookmakerIds, outcome) {
  return bookmakerIds
    .filter((bookmakerId) => ![primaryReferenceBookmaker].includes(bookmakerId))
    .map((bookmakerId) => ({
      bookmakerId,
      value: Number(outcomeValue(match.bookmakers?.[bookmakerId], outcome)),
    }))
    .filter((item) => isValidOdd(item.value))
    .sort((a, b) => a.value - b.value)[0] || null;
}

function favoriteMaxOdds(match) {
  const reference = match.bookmakers?.[primaryReferenceBookmaker];
  const candidates = matchWinnerOutcomes
    .map((outcome) => ({
      outcome,
      value: Number(outcomeValue(reference, outcome)),
    }))
    .filter((item) => isValidOdd(item.value));

  if (!candidates.length) return null;

  const favorite = candidates.sort((a, b) => a.value - b.value)[0];
  return {
    outcome: favorite.outcome,
    label: marketLabels[favorite.outcome],
    value: favorite.value * (1 + state.noVigLimitPercent / 100),
  };
}

function renderNoVigLimit() {
  els.noVigLimitValue.textContent = `${state.noVigLimitPercent.toFixed(1)}%`;
}

function highlightClass(match, bookmakerId, outcome, value) {
  const numericValue = Number(value);
  if (!isValidOdd(numericValue)) return "";
  if ([primaryReferenceBookmaker, fallbackReferenceBookmaker].includes(bookmakerId)) return "";

  const pinnacleValue = Number(outcomeValue(match.bookmakers?.[fallbackReferenceBookmaker], outcome));
  if (!isValidOdd(pinnacleValue) || numericValue <= pinnacleValue) return "";

  const noVigValue = Number(outcomeValue(match.bookmakers?.[primaryReferenceBookmaker], outcome));
  if (!isValidOdd(noVigValue)) return "above-reference";

  return numericValue > noVigValue * (1 + state.noVigLimitPercent / 100)
    ? "above-both-references"
    : "above-reference";
}

function renderHead() {
  const bookmakerMap = new Map((state.data?.bookmakers || []).map((bookmaker) => [bookmaker.id, bookmaker]));
  const enabled = bookmakerOrder.filter((id) => state.enabledBookmakers.has(id) && bookmakerMap.has(id));
  const outcomes = activeOutcomes();

  els.oddsHead.innerHTML = `
    <tr>
      <th class="match-head">Mec</th>
      <th class="max-head">Max kvota</th>
      ${enabled
        .map((id) => {
          const bookmaker = bookmakerMap.get(id);
          return `<th class="bookmaker-head" colspan="${outcomes.length}">${bookmaker?.name || id}</th>`;
        })
        .join("")}
      <th class="margin-head">Margina</th>
    </tr>
    <tr class="subhead">
      <th></th>
      <th class="max-head">fav</th>
      ${enabled
        .map(() =>
          outcomes
            .map((outcome, index) => {
              const className = index === 0 ? "group-start" : index === outcomes.length - 1 ? "group-end" : "";
              return `<th class="${className}">${marketLabels[outcome]}</th>`;
            })
            .join(""),
        )
        .join("")}
      <th class="margin-head">%</th>
    </tr>
  `;
}

function renderRows(matches) {
  const bookmakerMap = new Map((state.data?.bookmakers || []).map((bookmaker) => [bookmaker.id, bookmaker]));
  const enabled = bookmakerOrder.filter((id) => state.enabledBookmakers.has(id) && bookmakerMap.has(id));
  const outcomes = activeOutcomes();
  const columnCount = enabled.length * outcomes.length + 3;

  if (!matches.length) {
    const emptyMessage =
      state.view === "today"
        ? {
            title: "Nema danasnjih meceva u aktivnim feedovima.",
            text: "Filter obuhvata meceve od danas u 00:00 do sutra u 07:00.",
          }
        : {
            title: "Nema World Cup meceva u aktivnim feedovima.",
            text: "Dashboard je spreman; cim kladionice oznace SP ligu ili market, redovi ce se pojaviti ovde.",
          };

    els.oddsBody.innerHTML = `
      <tr>
        <td class="empty-state" colspan="${columnCount}">
          <strong>${emptyMessage.title}</strong>
          <span>${emptyMessage.text}</span>
        </td>
      </tr>
    `;
    return;
  }

  els.oddsBody.innerHTML = matches
    .map((match) => {
      const maxOdds = favoriteMaxOdds(match);
      const oddsCells = enabled
        .map((bookmakerId) => {
          const entry = match.bookmakers[bookmakerId];
          return outcomes
            .map((outcome, index) => {
              const value = outcomeValue(entry, outcome);
              const best = outcomeBest(match, outcome);
              const isBest = best?.bookmakerId === bookmakerId && Number(best.value) === Number(value);
              const lowest = lowestMarketOdd(match, enabled, outcome);
              const isLowest = lowest?.bookmakerId === bookmakerId && Number(lowest.value) === Number(value);
              const highlight = highlightClass(match, bookmakerId, outcome, value);
              const stateClass = value
                ? highlight || (isBest ? "best" : isLowest ? "lowest" : "")
                : "missing";
              const boundaryClass = index === 0 ? "group-start" : index === outcomes.length - 1 ? "group-end" : "";
              const className = ["odd-cell", stateClass, boundaryClass].filter(Boolean).join(" ");
              return `<td class="${className}">${formatOdd(value)}</td>`;
            })
            .join("");
        })
        .join("");

      return `
        <tr>
          <td class="match-cell">
            <span class="kickoff">${formatTime(match.kickOffTime)}</span>
            <strong>${match.home} <span>vs</span> ${match.away}</strong>
            <small>${match.leagueName}</small>
          </td>
          <td class="max-cell">
            ${
              maxOdds
                ? `<strong>${formatOdd(maxOdds.value)}</strong><span>${maxOdds.label}</span>`
                : `<strong>-</strong><span>-</span>`
            }
          </td>
          ${oddsCells}
          <td class="margin-cell">${match.margin === null ? "-" : `${match.margin.toFixed(2)}%`}</td>
        </tr>
      `;
    })
    .join("");
}

function renderSummary(matches) {
  const feeds = state.data?.feeds || [];
  const okFeeds = feeds.filter((feed) => feed.status === "ok").length;
  const margins = matches.map((match) => match.margin).filter((value) => Number.isFinite(Number(value)));
  const bestMargin = margins.length ? Math.min(...margins) : null;

  els.matchesCount.textContent = String(matches.length);
  els.activeFeeds.textContent = `${okFeeds}/${feeds.length || bookmakerOrder.length}`;
  els.bestMargin.textContent = bestMargin === null ? "-" : `${bestMargin.toFixed(2)}%`;
  els.updatedAt.textContent = state.data?.generatedAt ? formatDateTime(state.data.generatedAt) : "-";
  els.resultNote.textContent =
    state.data?.filter?.note ||
    (state.view === "today"
      ? `${matches.length} danasnjih mec(eva), period do sutra u 07:00.`
      : `${matches.length} World Cup mec(eva), ${state.data?.elapsedMs || 0} ms proxy vreme.`);
}

function render() {
  renderBookmakerToggles();
  const matches = visibleMatches();
  renderView();
  renderNoVigLimit();
  renderHead();
  renderRows(matches);
  renderSummary(matches);
}

els.refreshButton.addEventListener("click", loadOdds);
els.searchInput.addEventListener("input", (event) => {
  state.search = event.target.value;
  render();
});
els.noVigLimitInput.addEventListener("input", (event) => {
  state.noVigLimitPercent = Number(event.target.value) || 0;
  render();
});
els.viewButtons.forEach((button) => {
  button.addEventListener("click", () => {
    state.view = button.dataset.view || "all";
    render();
  });
});

loadOdds();
setInterval(refreshOddsOnTimer, oddsRefreshMs);
setInterval(renderRefreshCountdown, 1000);
