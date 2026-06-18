const bookmakerOrder = [
  "pinnacle_shin",
  "pinnacle",
  "merkurxtip",
  "maxbet",
  "mozzartbet",
  "superbet",
  "balkanbet",
  "soccerbet",
  "betinasia",
  "betfair_lay",
];
const primaryReferenceBookmaker = "pinnacle_shin";
const fallbackReferenceBookmaker = "pinnacle";
const pinnacleBrowserBase = "https://www.pinnacle888.com/sports-service/sv/euro";
const pinnacleBrowserSportId = 29;
const pinnacleBrowserLeagueCode = "fifa-world-cup";
const matchWinnerOutcomes = ["home", "draw", "away"];
const totalGoalsOutcomes = ["over25", "under25"];
const todayOutcomes = [...matchWinnerOutcomes, "over25", "under25"];
const outrightAlertLeadMs = 5 * 60 * 1000;
const outrightAlertStoragePrefix = "outright-alert-confirmed:";
const marketLabels = {
  home: "1",
  draw: "X",
  away: "2",
  over25: "Over",
  under25: "Under",
};

const state = {
  data: null,
  enabledBookmakers: new Set(bookmakerOrder),
  search: "",
  view: "all",
  noVigLimitPercent: 1,
  oddsThresholdPercent: 3,
  oddsSnapshot: new Map(),
  changedOddsUntil: new Map(),
  changedOddsDirection: new Map(),
  outrightAlertMatchKey: null,
  accumulatorX: 4,
  accumulatorType: "favorite",
};
const oddsRefreshMs = 30_000;
const oddsPulseMs = 10_000;
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
  oddsThresholdInput: document.querySelector("#oddsThresholdInput"),
  oddsThresholdValue: document.querySelector("#oddsThresholdValue"),
  matchesCount: document.querySelector("#matchesCount"),
  activeFeeds: document.querySelector("#activeFeeds"),
  bestMargin: document.querySelector("#bestMargin"),
  updatedAt: document.querySelector("#updatedAt"),
  tableTitle: document.querySelector("#tableTitle"),
  resultNote: document.querySelector("#resultNote"),
  oddsHead: document.querySelector("#oddsHead"),
  oddsBody: document.querySelector("#oddsBody"),
  oddsTable: document.querySelector(".odds-table"),
  valueTickerWrap: document.querySelector("#valueTickerWrap"),
  valueTicker: document.querySelector("#valueTicker"),
  accumulatorFilterSection: document.querySelector("#accumulatorFilterSection"),
  accumulatorXInput: document.querySelector("#accumulatorXInput"),
  accumulatorXValue: document.querySelector("#accumulatorXValue"),
  accumulatorTypeSelect: document.querySelector("#accumulatorTypeSelect"),
  accumulatorView: document.querySelector("#accumulatorView"),
  oddsTableWrap: document.querySelector("#oddsTableWrap"),
};

function formatOdd(value) {
  if (value === null || value === undefined || value === "") return "-";
  return Number.isFinite(Number(value)) ? Number(value).toFixed(2) : "-";
}

function formatGoalsLine(line) {
  const numeric = Number(line);
  return Number.isFinite(numeric) ? numeric.toFixed(1) : "-";
}

function goalsOutcomeLabel(match, outcome) {
  const line = formatGoalsLine(match?.goalsLine);
  if (outcome === "over25") return `${line}+`;
  if (outcome === "under25") return `${line}-`;
  return marketLabels[outcome];
}

function oddsChangeKey(matchKey, bookmakerId, outcome) {
  return `${matchKey}|${bookmakerId}|${outcome}`;
}

function oddsSnapshotValue(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 1 ? numeric.toFixed(3) : null;
}

function collectOddsSnapshot(data) {
  const snapshot = new Map();
  for (const match of data?.matches || []) {
    for (const [bookmakerId, entry] of Object.entries(match.bookmakers || {})) {
      for (const outcome of todayOutcomes) {
        const value = oddsSnapshotValue(outcomeValue(entry, outcome));
        if (value) snapshot.set(oddsChangeKey(match.matchKey, bookmakerId, outcome), value);
      }
    }
  }
  return snapshot;
}

function oddsMovePercent(oldValue, newValue) {
  const previous = Number(oldValue);
  const current = Number(newValue);
  if (!isValidOdd(previous) || !isValidOdd(current)) return 0;
  return Math.abs((current / previous - 1) * 100);
}

function getBookmakerName(bookmakerId) {
  const bookmaker = state.data?.bookmakers?.find((b) => b.id === bookmakerId);
  return bookmaker?.name || bookmakerId;
}

function getOutcomeToastLabel(match, outcome) {
  if (outcome === "over25") {
    const line = formatGoalsLine(match?.goalsLine || 2.5);
    return `Golovi ${line}+`;
  }
  if (outcome === "under25") {
    const line = formatGoalsLine(match?.goalsLine || 2.5);
    return `Golovi ${line}-`;
  }
  return marketLabels[outcome] || outcome;
}

function copyTextToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text);
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
  return Promise.resolve();
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function showOddsChangeNotification(changes) {
  let backdrop = document.querySelector(".notification-backdrop");
  if (!backdrop) {
    backdrop = document.createElement("div");
    backdrop.className = "notification-backdrop";
    backdrop.innerHTML = `
      <div class="notification-modal">
        <div class="notification-header">
          <span class="notification-title">Promena Kvota</span>
          <button class="notification-close" type="button" aria-label="Zatvori">&times;</button>
        </div>
        <div class="notification-body">
          <div class="notification-subtitle">Detektovane su promene kvota:</div>
          <div class="notification-list"></div>
        </div>
      </div>
    `;
    document.body.appendChild(backdrop);

    const closeBtn = backdrop.querySelector(".notification-close");
    closeBtn.addEventListener("click", () => {
      backdrop.classList.remove("show");
    });
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) {
        backdrop.classList.remove("show");
      }
    });
    backdrop.addEventListener("click", async (e) => {
      const copyButton = e.target.closest(".notification-copy");
      if (!copyButton) return;

      e.stopPropagation();
      const text = copyButton.dataset.copy || "";
      if (!text) return;

      try {
        await copyTextToClipboard(text);
        copyButton.textContent = "Copied";
        copyButton.classList.add("is-copied");
        window.setTimeout(() => {
          copyButton.textContent = "Copy";
          copyButton.classList.remove("is-copied");
        }, 1200);
      } catch {
        copyButton.textContent = "Failed";
        window.setTimeout(() => {
          copyButton.textContent = "Copy";
        }, 1200);
      }
    });
  }

  const list = backdrop.querySelector(".notification-list");
  list.innerHTML = changes
    .map((change) => {
      const match = state.data?.matches?.find((m) => m.matchKey === change.matchKey);
      if (!match) return "";

      const bName = getBookmakerName(change.bookmakerId);
      const label = getOutcomeToastLabel(match, change.outcome);
      const isUp = change.newValue > change.oldValue;
      const badgeClass = isUp ? "up" : "down";
      const icon = isUp ? "↑" : "↓";

      const matchup = `${match.home} vs ${match.away}`;
      const escapedMatchup = escapeHtml(matchup);

      return `
        <div class="notification-item">
          <div class="notification-match-row">
            <div class="notification-match">${escapedMatchup}</div>
            <button class="notification-copy" type="button" data-copy="${escapedMatchup}">Copy</button>
          </div>
          <div class="notification-detail">
            <span class="notification-meta">${bName} · ${label}</span>
            <div class="notification-change-box">
              <span class="notification-odd-transition">${change.oldValue.toFixed(2)} &rarr;</span>
              <span class="notification-badge ${badgeClass}">${icon} ${change.newValue.toFixed(2)}</span>
            </div>
          </div>
        </div>
            <span class="notification-meta">${bName} · ${label}</span>
            <div class="notification-change-box">
              <span class="notification-odd-transition">${change.oldValue.toFixed(2)} &rarr;</span>
              <span class="notification-badge ${badgeClass}">${icon} ${change.newValue.toFixed(2)}</span>
            </div>
          </div>
        </div>
      `;
    })
    .filter(Boolean)
    .join("");

  backdrop.classList.add("show");
  
  if (backdrop.hideTimeout) {
    clearTimeout(backdrop.hideTimeout);
  }
  backdrop.hideTimeout = setTimeout(() => {
    backdrop.classList.remove("show");
  }, 15000);
}

function trackChangedOdds(previousSnapshot, nextSnapshot) {
  const now = Date.now();
  const changes = [];

  for (const [key, value] of nextSnapshot.entries()) {
    const previousValue = previousSnapshot.get(key);
    if (previousValue && previousValue !== value) {
      state.changedOddsUntil.set(key, now + oddsPulseMs);
      state.changedOddsDirection.set(key, Number(value) > Number(previousValue) ? "up" : "down");
      const movePercent = oddsMovePercent(previousValue, value);
      if (movePercent < state.oddsThresholdPercent) continue;

      const parts = key.split("|");
      if (parts.length === 3) {
        const [matchKey, bookmakerId, outcome] = parts;
        changes.push({
          matchKey,
          bookmakerId,
          outcome,
          oldValue: Number(previousValue),
          newValue: Number(value),
          movePercent,
        });
      }
    }
  }

  for (const [key, expiresAt] of state.changedOddsUntil.entries()) {
    if (expiresAt <= now) {
      state.changedOddsUntil.delete(key);
      state.changedOddsDirection.delete(key);
    }
  }

  state.oddsSnapshot = nextSnapshot;

  if (previousSnapshot.size > 0 && changes.length > 0) {
    showOddsChangeNotification(changes);
  }
}

function isOddPulsing(matchKey, bookmakerId, outcome) {
  const key = oddsChangeKey(matchKey, bookmakerId, outcome);
  const expiresAt = state.changedOddsUntil.get(key);
  if (!expiresAt) return false;
  if (expiresAt <= Date.now()) {
    state.changedOddsUntil.delete(key);
    state.changedOddsDirection.delete(key);
    return false;
  }
  return true;
}

function oddMoveDirection(matchKey, bookmakerId, outcome) {
  if (!isOddPulsing(matchKey, bookmakerId, outcome)) return null;
  return state.changedOddsDirection.get(oddsChangeKey(matchKey, bookmakerId, outcome)) || null;
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

function getFirstTodayMatch() {
  return (state.data?.matches || [])
    .filter(isTodayMatch)
    .filter((match) => Number.isFinite(Number(match.kickOffTime)))
    .sort((a, b) => Number(a.kickOffTime) - Number(b.kickOffTime))[0] || null;
}

function outrightAlertStorageKey(match) {
  const matchKey = match?.matchKey || createMatchKey(match?.home, match?.away, match?.kickOffTime);
  return `${outrightAlertStoragePrefix}${matchKey}:${Number(match?.kickOffTime) || "unknown"}`;
}

function isOutrightAlertConfirmed(match) {
  if (!match) return true;
  return window.localStorage.getItem(outrightAlertStorageKey(match)) === "1";
}

function confirmOutrightAlert(match) {
  if (!match) return;
  window.localStorage.setItem(outrightAlertStorageKey(match), "1");
}

function showOutrightAlert(match) {
  if (!match || state.outrightAlertMatchKey === outrightAlertStorageKey(match)) return;

  let backdrop = document.querySelector(".outright-alert-backdrop");
  if (!backdrop) {
    backdrop = document.createElement("div");
    backdrop.className = "outright-alert-backdrop";
    backdrop.innerHTML = `
      <div class="outright-alert-modal" role="dialog" aria-modal="true" aria-labelledby="outrightAlertTitle">
        <div class="outright-alert-kicker">Upozorenje</div>
        <h2 id="outrightAlertTitle">Zatvori Outrights</h2>
        <p class="outright-alert-text"></p>
        <button class="outright-alert-confirm" type="button">Potvrdjujem</button>
      </div>
    `;
    document.body.appendChild(backdrop);
  }

  const matchup = `${match.home} vs ${match.away}`;
  backdrop.querySelector(".outright-alert-text").textContent =
    `Prva utakmica danas pocinje u ${formatTime(match.kickOffTime)}: ${matchup}.`;

  const confirmButton = backdrop.querySelector(".outright-alert-confirm");
  confirmButton.onclick = () => {
    confirmOutrightAlert(match);
    state.outrightAlertMatchKey = null;
    backdrop.classList.remove("show");
  };

  state.outrightAlertMatchKey = outrightAlertStorageKey(match);
  backdrop.classList.add("show");
  confirmButton.focus();
}

function checkOutrightAlert() {
  const match = getFirstTodayMatch();
  if (!match || isOutrightAlertConfirmed(match)) return;

  const kickOffTime = Number(match.kickOffTime);
  if (Date.now() >= kickOffTime - outrightAlertLeadMs) {
    showOutrightAlert(match);
  }
}

async function loadOdds() {
  if (isLoadingOdds) return;
  isLoadingOdds = true;
  nextRefreshAt = Date.now() + oddsRefreshMs;
  renderRefreshCountdown();
  setLoading(true);
  try {
    const previousSnapshot = state.oddsSnapshot;
    const response = await fetch("/api/odds", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.data = await response.json();
    try {
      await hydratePinnacleFromBrowser();
    } catch (error) {
      console.warn("Pinnacle browser fallback failed:", error);
    }
    trackChangedOdds(previousSnapshot, collectOddsSnapshot(state.data));
    render();
    checkOutrightAlert();
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
  const now = Date.now();
  return matches.filter((match) => {
    if (match.kickOffTime && Number(match.kickOffTime) < now) return false;
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
    goals: "World Cup 2026 - Golovi 2.5",
    accumulator: "Množenje kvota na favorite za naredne mečeve",
  };
  els.tableTitle.textContent = titles[state.view] || titles.all;
  els.oddsTable.classList.toggle("is-today", state.view === "today");

  const isAcc = state.view === "accumulator";
  els.oddsTableWrap.style.display = isAcc ? "none" : "block";
  els.accumulatorView.style.display = isAcc ? "flex" : "none";
  els.accumulatorFilterSection.style.display = isAcc ? "block" : "none";

  const noVigLimitSec = els.noVigLimitInput?.closest("section");
  const thresholdSec = els.oddsThresholdInput?.closest("section");
  if (noVigLimitSec) noVigLimitSec.style.display = isAcc ? "none" : "block";
  if (thresholdSec) thresholdSec.style.display = isAcc ? "none" : "block";
}

function activeOutcomes() {
  if (state.view === "goals") return totalGoalsOutcomes;
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
    ["bih", "Bosnia and Herzegovina"],
    ["bosnia and herzegovina", "Bosnia and Herzegovina"],
    ["bosnia-herzegovina", "Bosnia and Herzegovina"],
    ["bosna i hercegovina", "Bosnia and Herzegovina"],
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

function emptyTotals25() {
  return { over: null, under: null, line: null };
}

function emptyTotalsByLine() {
  return {};
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

function totalsByLineFromLineObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return totalsByLineFromLines(value);
  return totalsByLineFromLines(
    Object.entries(value).map(([line, item]) =>
      item && typeof item === "object" ? { line, ...item } : { line, value: item },
    ),
  );
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

function hasCompleteTotals(totals) {
  return isValidOdd(totals?.over) && isValidOdd(totals?.under);
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

function getBestTotals25(bookmakers) {
  const best = {};
  for (const field of ["over", "under"]) {
    let top = { value: null, bookmakerId: null, bookmakerName: null };
    for (const entry of Object.values(bookmakers || {})) {
      if (entry.isReference) continue;
      const value = Number(entry.totals25?.[field]);
      if (isValidOdd(value) && (!top.value || value > top.value)) {
        top = { value, bookmakerId: entry.bookmakerId, bookmakerName: entry.bookmakerName };
      }
    }
    best[field] = top;
  }
  return best;
}

function chooseGoalsLine(match) {
  const pinnacleTotals = match.bookmakers?.pinnacle?.totalsByLine || {};
  if (hasCompleteTotals(totalsForLine(pinnacleTotals, 2.5))) return 2.5;
  if (hasCompleteTotals(totalsForLine(pinnacleTotals, 3.5))) return 3.5;

  const fallbackTotals = match.bookmakers?.betinasia?.totalsByLine || {};
  if (hasCompleteTotals(totalsForLine(fallbackTotals, 2.5))) return 2.5;
  if (hasCompleteTotals(totalsForLine(fallbackTotals, 3.5))) return 3.5;

  for (const entry of Object.values(match.bookmakers || {})) {
    if (entry.isReference) continue;
    if (hasCompleteTotals(totalsForLine(entry.totalsByLine, 2.5))) return 2.5;
  }

  for (const entry of Object.values(match.bookmakers || {})) {
    if (entry.isReference) continue;
    if (hasCompleteTotals(totalsForLine(entry.totalsByLine, 3.5))) return 3.5;
  }

  return null;
}

function applySelectedGoalsLine(match) {
  const goalsLine = chooseGoalsLine(match);
  match.goalsLine = goalsLine;

  for (const entry of Object.values(match.bookmakers || {})) {
    entry.totals25 = goalsLine === null ? emptyTotals25() : totalsForLine(entry.totalsByLine, goalsLine);
  }
}

function applyNoVigReference(match) {
  const pinnacle = match.bookmakers?.pinnacle;
  const betinasia = match.bookmakers?.betinasia;
  const oddsSource =
    isValidOdd(pinnacle?.odds?.home) && isValidOdd(pinnacle?.odds?.draw) && isValidOdd(pinnacle?.odds?.away)
      ? pinnacle
      : betinasia;
  const totalsSource =
    hasCompleteTotals(pinnacle?.totals25)
      ? pinnacle
      : hasCompleteTotals(betinasia?.totals25)
        ? betinasia
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

  match.bookmakers.pinnacle_shin = {
    ...match.bookmakers.pinnacle_shin,
    bookmakerId: "pinnacle_shin",
    bookmakerName: "Pinnacle no-vig",
    isReference: true,
    odds: { home, draw, away },
    totalsByLine: match.goalsLine === null ? emptyTotalsByLine() : { [String(match.goalsLine)]: { line: match.goalsLine, over, under } },
    totals25: { line: match.goalsLine, over, under },
    updatedAt: oddsSource?.updatedAt || totalsSource?.updatedAt || null,
    externalId: oddsSource?.externalId || totalsSource?.externalId || null,
  };
}

function normalizePinnacleOffer(event) {
  const [home, away] = getPinnacleTeamNames(event);
  const kickOffTime = Number(getPinnacleKickoff(event));
  const moneyline = getPinnacleMoneyline(event);
  const totalsByLine = getPinnacleTotalsByLine(event);
  return {
    matchKey: createMatchKey(home, away, kickOffTime),
    externalId: event.id || event.eventId || event.event_id,
    odds: {
      home: normalizePrice(moneyline.home ?? moneyline.homePrice),
      draw: normalizePrice(moneyline.draw ?? moneyline.drawPrice),
      away: normalizePrice(moneyline.away ?? moneyline.awayPrice),
    },
    totalsByLine,
  };
}

async function hydratePinnacleFromBrowser() {
  const pinnacleFeed = state.data?.feeds?.find((feed) => feed.bookmakerId === "pinnacle");

  const hasPinnacleOdds = (state.data?.matches || []).some((match) =>
    matchWinnerOutcomes.some((outcome) => isValidOdd(match.bookmakers?.pinnacle?.odds?.[outcome])),
  );
  const hasPinnacleGoals = (state.data?.matches || []).some((match) =>
    hasCompleteTotals(match.bookmakers?.pinnacle?.totals25),
  );
  if (!state.data || (hasPinnacleOdds && hasPinnacleGoals)) return;

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
      totalsByLine: Object.keys(offer.totalsByLine || {}).length
        ? offer.totalsByLine
        : match.bookmakers.pinnacle?.totalsByLine || emptyTotalsByLine(),
      updatedAt: Date.now(),
      externalId: offer.externalId,
    };
    applySelectedGoalsLine(match);
    applyNoVigReference(match);
    match.best = getBestOdds(match.bookmakers);
    match.bestTotals25 = getBestTotals25(match.bookmakers);
    match.margin = estimateBestMargin(match.bookmakers);
  }

  if (pinnacleFeed) {
    pinnacleFeed.status = "ok";
    pinnacleFeed.message = "Loaded in browser fallback.";
    pinnacleFeed.worldCupMatches = offers.size;
    pinnacleFeed.matchedMatches = state.data.matches.filter((match) =>
      matchWinnerOutcomes.some((outcome) => isValidOdd(match.bookmakers?.pinnacle?.odds?.[outcome])) ||
      hasCompleteTotals(match.bookmakers?.pinnacle?.totals25),
    ).length;
  }
}

function lowestMarketOdd(match, bookmakerIds, outcome) {
  return bookmakerIds
    .filter((bookmakerId) => ![primaryReferenceBookmaker, "betfair_lay"].includes(bookmakerId))
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

function goalsMaxOdds(match) {
  const reference = match.bookmakers?.[primaryReferenceBookmaker];
  const candidates = totalGoalsOutcomes
    .map((outcome) => ({
      outcome,
      value: Number(outcomeValue(reference, outcome)),
    }))
    .filter((item) => isValidOdd(item.value));

  if (!candidates.length) return null;

  const favorite = candidates.sort((a, b) => a.value - b.value)[0];
  return {
    outcome: favorite.outcome,
    label: goalsOutcomeLabel(match, favorite.outcome),
    value: favorite.value * (1 + state.noVigLimitPercent / 100),
  };
}

function marketMaxOdds(match) {
  return state.view === "goals" ? goalsMaxOdds(match) : favoriteMaxOdds(match);
}

function goalsMargin(match) {
  const over = Number(match.bestTotals25?.over?.value);
  const under = Number(match.bestTotals25?.under?.value);
  if (!isValidOdd(over) || !isValidOdd(under)) return null;
  return (1 / over + 1 / under - 1) * 100;
}

function marketMargin(match) {
  return state.view === "goals" ? goalsMargin(match) : match.margin;
}

function renderNoVigLimit() {
  els.noVigLimitValue.textContent = `${state.noVigLimitPercent.toFixed(1)}%`;
}

function renderOddsThreshold() {
  els.oddsThresholdValue.textContent = `${state.oddsThresholdPercent.toFixed(1)}%`;
}

function highlightClass(match, bookmakerId, outcome, value) {
  const numericValue = Number(value);
  if (!isValidOdd(numericValue)) return "";
  if ([primaryReferenceBookmaker, fallbackReferenceBookmaker, "betfair_lay"].includes(bookmakerId)) return "";

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

function formatMoneyFlow(amount) {
  if (!amount || amount <= 0) return null;
  if (amount >= 1000000) return `€${(amount / 1000000).toFixed(1)}M`;
  if (amount >= 1000) return `€${(amount / 1000).toFixed(0)}K`;
  return `€${Math.floor(amount)}`;
}

function renderMoneyFlowChart(history, outcome) {
  if (!history || history.length < 2) return "";
  
  const data = [...history].reverse().map(h => outcome ? (h[outcome] || 0) : (h.home + h.draw + h.away));
  const min = Math.min(...data);
  const max = Math.max(...data);
  
  if (max === 0 || max === min) return "";
  
  const width = 80;
  const height = 16;
  const padding = 2;
  
  const points = data.map((val, i) => {
    const x = padding + (i / (data.length - 1)) * (width - 2 * padding);
    const y = height - padding - ((val - min) / (max - min)) * (height - 2 * padding);
    return `${x},${y}`;
  }).join(" ");
  
  return `
    <div class="money-flow-chart-wrap" title="Betfair matched volume history">
      <svg class="money-flow-chart" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
        <polyline points="${points}" fill="none" stroke="var(--green)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </div>
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
      const maxOdds = marketMaxOdds(match);
      const margin = marketMargin(match);

      const bfMoneyFlow = match.bookmakers?.betfair_lay?.bfMoneyFlow || match.bfMoneyFlow;
      const bfMoneyFlowHistory = match.bookmakers?.betfair_lay?.bfMoneyFlowHistory || match.bfMoneyFlowHistory;
      const totalMatched = bfMoneyFlow ? (bfMoneyFlow.home || 0) + (bfMoneyFlow.draw || 0) + (bfMoneyFlow.away || 0) : 0;
      const formattedMatched = totalMatched > 0 ? formatMoneyFlow(totalMatched) : null;
      const oddsCells = enabled
        .map((bookmakerId) => {
          const entry = match.bookmakers[bookmakerId];
          const isRef = entry?.isReference || bookmakerId === "betfair_lay" || bookmakerId === "pinnacle_shin";
          return outcomes
            .map((outcome, index) => {
              const value = outcomeValue(entry, outcome);
              const best = outcomeBest(match, outcome);
              const isBest = !isRef && best?.bookmakerId === bookmakerId && Number(best.value) === Number(value);
              const lowest = lowestMarketOdd(match, enabled, outcome);
              const isLowest = !isRef && lowest?.bookmakerId === bookmakerId && Number(lowest.value) === Number(value);
              const highlight = highlightClass(match, bookmakerId, outcome, value);
              const stateClass = value
                ? highlight || (isBest ? "best" : isLowest ? "lowest" : "")
                : "missing";
              const boundaryClass = index === 0 ? "group-start" : index === outcomes.length - 1 ? "group-end" : "";
              const moveDirection = oddMoveDirection(match.matchKey, bookmakerId, outcome);
              const pulseClass = moveDirection ? "is-changing" : "";
              const directionClass = moveDirection ? `move-${moveDirection}` : "";
              const className = ["odd-cell", stateClass, boundaryClass, pulseClass, directionClass].filter(Boolean).join(" ");
              const moveArrow =
                moveDirection === "up"
                  ? `<span class="odd-move-arrow" aria-label="Kvota raste">&uarr;</span>`
                  : moveDirection === "down"
                    ? `<span class="odd-move-arrow" aria-label="Kvota pada">&darr;</span>`
                    : "";
                    
              let moneyFlowHtml = "";
              if (bookmakerId === "betfair_lay" && bfMoneyFlow && bfMoneyFlow[outcome]) {
                const flow = formatMoneyFlow(bfMoneyFlow[outcome]);
                const chart = renderMoneyFlowChart(bfMoneyFlowHistory, outcome);
                moneyFlowHtml = `
                  <div class="money-flow-outcome">
                    <span class="money-flow-val">${flow}</span>
                    ${chart}
                  </div>
                `;
              }

              return `<td class="${className}">
                <span class="odd-value">${formatOdd(value)}</span>${moveArrow}
                ${moneyFlowHtml}
              </td>`;
            })
            .join("");
        })
        .join("");

      return `
        <tr>
          <td class="match-cell">
            <div class="match-cell-top">
              <span class="kickoff">${formatTime(match.kickOffTime)}</span>
              ${formattedMatched ? `<span class="money-flow-total" title="Betfair Matched Volume">${formattedMatched}</span>` : ""}
            </div>
            <strong>${match.home} <span>vs</span> ${match.away}</strong>
            <div class="match-cell-bottom">
              <small>${match.leagueName}${match.goalsLine && state.view !== "all" ? ` · golovi ${formatGoalsLine(match.goalsLine)}` : ""}</small>
            </div>
          </td>
          <td class="max-cell">
            ${
              maxOdds
                ? `<strong>${formatOdd(maxOdds.value)}</strong><span>${maxOdds.label}</span>`
                : `<strong>-</strong><span>-</span>`
            }
          </td>
          ${oddsCells}
          <td class="margin-cell">${margin === null ? "-" : `${margin.toFixed(2)}%`}</td>
        </tr>
      `;
    })
    .join("");
}

function renderSummary(matches) {
  const feeds = state.data?.feeds || [];
  const okFeeds = feeds.filter((feed) => feed.status === "ok").length;
  const margins = matches.map((match) => marketMargin(match)).filter((value) => Number.isFinite(Number(value)));
  const bestMargin = margins.length ? Math.min(...margins) : null;

  els.matchesCount.textContent = String(matches.length);
  els.activeFeeds.textContent = `${okFeeds}/${feeds.length || bookmakerOrder.length}`;
  els.bestMargin.textContent = bestMargin === null ? "-" : `${bestMargin.toFixed(2)}%`;
  els.updatedAt.textContent = state.data?.generatedAt ? formatDateTime(state.data.generatedAt) : "-";
  els.resultNote.textContent =
    state.data?.filter?.note ||
    (state.view === "today"
      ? `${matches.length} danasnjih mec(eva), period do sutra u 07:00.`
      : state.view === "goals"
        ? `${matches.length} World Cup mec(eva), golovi 2.5 ili 3.5, ${state.data?.elapsedMs || 0} ms proxy vreme.`
        : `${matches.length} World Cup mec(eva), ${state.data?.elapsedMs || 0} ms proxy vreme.`);
}

function updateValueTicker(matches) {
  if (!matches || !matches.length) {
    els.valueTickerWrap.style.display = "none";
    return;
  }

  const valueBets = [];
  const bookmakers = state.data?.bookmakers || bookmakerOrder.map((id) => ({ id, name: id }));
  const bookmakerMap = new Map(bookmakers.map((b) => [b.id, b]));

  let outcomesToCheck = [];
  if (state.view === "goals") {
    outcomesToCheck = ["over25", "under25"];
  } else if (state.view === "today") {
    outcomesToCheck = ["home", "draw", "away", "over25", "under25"];
  } else {
    outcomesToCheck = ["home", "draw", "away"];
  }

  for (const match of matches) {
    const pinnacleShin = match.bookmakers?.pinnacle_shin;
    if (!pinnacleShin) continue;

    for (const outcome of outcomesToCheck) {
      const noVig = outcomeValue(pinnacleShin, outcome);
      if (!isValidOdd(noVig)) continue;

      for (const [bookmakerId, entry] of Object.entries(match.bookmakers || {})) {
        if (entry.isReference || bookmakerId === "pinnacle_shin" || bookmakerId === "betfair_lay") continue;
        if (!state.enabledBookmakers.has(bookmakerId) || !bookmakerMap.has(bookmakerId)) continue;

        const odd = outcomeValue(entry, outcome);
        if (!isValidOdd(odd)) continue;

        const edge = ((Number(odd) / Number(noVig)) - 1) * 100;
        if (edge > 0) {
          const outcomeLabel = outcome === "over25" || outcome === "under25" 
            ? goalsOutcomeLabel(match, outcome) 
            : marketLabels[outcome];

          valueBets.push({
            matchup: `${match.home} - ${match.away}`,
            outcomeLabel,
            odd: Number(odd),
            bookmaker: entry.bookmakerName,
            edge: edge,
          });
        }
      }
    }
  }

  valueBets.sort((a, b) => b.edge - a.edge);

  if (valueBets.length === 0) {
    els.valueTicker.innerHTML = `<span class="ticker-item">Trenutno nema value kvota iznad Pinnacle no-vig reference.</span>`;
    els.valueTickerWrap.style.display = "flex";
    return;
  }

  const topValueBets = valueBets.slice(0, 10);
  const tickerHtml = topValueBets
    .map((bet) => {
      return `<span class="ticker-item"><strong>${bet.matchup}</strong> (${bet.outcomeLabel}) @ <strong>${bet.odd.toFixed(2)}</strong> (${bet.bookmaker}) <span style="color: var(--green); font-weight: 700;">+${bet.edge.toFixed(1)}%</span></span>`;
    })
    .join("");

  els.valueTicker.innerHTML = tickerHtml + tickerHtml; // Double it for seamless loop scrolling
  els.valueTickerWrap.style.display = "flex";
}

function calculateAccumulator(matches, X, type = "favorite") {
  const legs = [];
  let count = 0;
  
  const sortedMatches = [...matches].sort((a, b) => Number(a.kickOffTime || 0) - Number(b.kickOffTime || 0));
  
  for (const match of sortedMatches) {
    if (count >= X) break;
    
    let outcome = null;
    let refOdd = null;
    let teamName = "";
    let customLabel = null;
    
    if (type === "over25") {
      const overOdd = outcomeValue(match.bookmakers?.pinnacle_shin, "over25") || outcomeValue(match.bookmakers?.pinnacle, "over25");
      let hasDomOdds = false;
      const domesticBookieIds = ["merkurxtip", "maxbet", "mozzartbet", "balkanbet", "soccerbet", "superbet"];
      for (const bookieId of domesticBookieIds) {
        if (isValidOdd(outcomeValue(match.bookmakers?.[bookieId], "over25"))) {
          hasDomOdds = true;
          break;
        }
      }
      
      if (hasDomOdds) {
        outcome = "over25";
        refOdd = isValidOdd(overOdd) ? Number(overOdd) : null;
        teamName = "Ukupno golova";
        customLabel = "3+";
      }
    } else {
      const refOdds = match.bookmakers?.pinnacle_shin?.odds || match.bookmakers?.pinnacle?.odds;
      let favOutcome = null;
      let minOdd = Infinity;
      
      if (refOdds && isValidOdd(refOdds.home) && isValidOdd(refOdds.draw) && isValidOdd(refOdds.away)) {
        if (Number(refOdds.home) < minOdd) { minOdd = Number(refOdds.home); favOutcome = "home"; }
        if (Number(refOdds.draw) < minOdd) { minOdd = Number(refOdds.draw); favOutcome = "draw"; }
        if (Number(refOdds.away) < minOdd) { minOdd = Number(refOdds.away); favOutcome = "away"; }
      } else {
        let homeSum = 0, drawSum = 0, awaySum = 0;
        let homeCount = 0, drawCount = 0, awayCount = 0;
        for (const entry of Object.values(match.bookmakers || {})) {
          if (entry.isReference) continue;
          if (isValidOdd(entry.odds?.home)) { homeSum += Number(entry.odds.home); homeCount++; }
          if (isValidOdd(entry.odds?.draw)) { drawSum += Number(entry.odds.draw); drawCount++; }
          if (isValidOdd(entry.odds?.away)) { awaySum += Number(entry.odds.away); awayCount++; }
        }
        const avgHome = homeCount > 0 ? homeSum / homeCount : Infinity;
        const avgDraw = drawCount > 0 ? drawSum / drawCount : Infinity;
        const avgAway = awayCount > 0 ? awaySum / awayCount : Infinity;
        
        if (avgHome < minOdd) { minOdd = avgHome; favOutcome = "home"; }
        if (avgDraw < minOdd) { minOdd = avgDraw; favOutcome = "draw"; }
        if (avgAway < minOdd) { minOdd = avgAway; favOutcome = "away"; }
      }
      
      if (favOutcome && minOdd !== Infinity) {
        outcome = favOutcome;
        refOdd = minOdd;
        teamName = favOutcome === "home" ? match.home : favOutcome === "away" ? match.away : "Nerešeno";
      }
    }
    
    if (!outcome) continue;
    
    legs.push({
      match,
      outcome,
      team: teamName,
      refOdd,
      customLabel
    });
    count++;
  }
  
  const domesticBookies = [
    { id: "merkurxtip", name: "MerkurXtip" },
    { id: "maxbet", name: "MaxBet" },
    { id: "mozzartbet", name: "Mozzart" },
    { id: "balkanbet", name: "BalkanBet" },
    { id: "soccerbet", name: "SoccerBet" },
    { id: "superbet", name: "Superbet" }
  ];
  
  const rankedBookmakers = domesticBookies.map(bookie => {
    let totalOdd = 1;
    let complete = true;
    const legOdds = [];
    
    for (const leg of legs) {
      const odd = outcomeValue(leg.match.bookmakers?.[bookie.id], leg.outcome);
      if (isValidOdd(odd)) {
        totalOdd *= Number(odd);
        legOdds.push(Number(odd));
      } else {
        complete = false;
        legOdds.push(null);
      }
    }
    
    return {
      ...bookie,
      totalOdd: complete ? totalOdd : null,
      legOdds,
      complete
    };
  });
  
  let refTotalOdd = 1;
  let refComplete = true;
  for (const leg of legs) {
    const odd = outcomeValue(leg.match.bookmakers?.pinnacle_shin, leg.outcome);
    if (isValidOdd(odd)) {
      refTotalOdd *= Number(odd);
    } else {
      refComplete = false;
    }
  }
  
  return {
    legs,
    rankedBookmakers,
    referenceParlay: refComplete ? refTotalOdd : null
  };
}

function renderAccumulatorView(matches) {
  const X = state.accumulatorX || 4;
  const result = calculateAccumulator(matches, X, state.accumulatorType || "favorite");
  
  if (!result.legs.length) {
    els.accumulatorView.innerHTML = `
      <div class="empty-state">
        <strong>Nema raspoloživih mečeva</strong>
        <span>Osvežite podatke ili proverite filtere bookmakera.</span>
      </div>
    `;
    return;
  }
  
  const ranked = [...result.rankedBookmakers].sort((a, b) => {
    if (!a.complete && b.complete) return 1;
    if (a.complete && !b.complete) return -1;
    if (!a.complete && !b.complete) return 0;
    return b.totalOdd - a.totalOdd;
  });
  
  const bestOdd = ranked[0]?.complete ? ranked[0].totalOdd : null;
  const refOdd = result.referenceParlay;
  
  const cardsHtml = ranked.map((bookie, index) => {
    const rank = index + 1;
    const rankClass = bookie.complete ? `rank-${rank}` : 'incomplete';
    const relPercent = (bookie.complete && bestOdd > 0) ? (bookie.totalOdd / bestOdd) * 100 : 0;
    
    let edgeHtml = '';
    let ticketDataStr = '';
    
    if (bookie.complete) {
      if (refOdd && refOdd > 0) {
        const edgePercent = ((bookie.totalOdd / refOdd) - 1) * 100;
        const sign = edgePercent > 0 ? '+' : '';
        const edgeClass = edgePercent > 0 ? 'positive' : (edgePercent < 0 ? 'negative' : 'neutral');
        edgeHtml = `<span class="card-edge ${edgeClass}">${sign}${edgePercent.toFixed(1)}% vs Pinnacle</span>`;
      } else {
        edgeHtml = `<span class="card-edge neutral">Nema reference</span>`;
      }
      
      const typeTitle = state.accumulatorType === "over25" ? "Akumulator Golova 3+" : "Akumulator Favorita";
      const legTexts = result.legs.map((leg, i) => {
        const oddVal = bookie.legOdds[i] ? bookie.legOdds[i].toFixed(2) : '-';
        const label = state.accumulatorType === "over25" ? "Golovi 3+" : `${leg.team} (${marketLabels[leg.outcome]})`;
        return `${i+1}. ${leg.match.home} - ${leg.match.away} (${label}): ${oddVal}`;
      });
      ticketDataStr = escapeHtml(`${bookie.name} ${typeTitle} (x${X}):\n` + legTexts.join('\n') + `\nUkupna kvota: ${bookie.totalOdd.toFixed(2)}`);
    } else {
      edgeHtml = `<span class="card-edge neutral">Nepotpuno</span>`;
    }
    
    const oddDisplay = bookie.complete ? bookie.totalOdd.toFixed(2) : 'Nepotpuno';
    
    return `
      <div class="leaderboard-card ${rankClass}">
        <div class="card-header">
          <span class="card-title">${bookie.name}</span>
          <span class="rank-badge">${bookie.complete ? rank : '–'}</span>
        </div>
        <div class="card-odd-row">
          <strong class="card-odd-value">${oddDisplay}</strong>
          ${bookie.complete ? `<span class="card-odd-label">kvota</span>` : ''}
        </div>
        ${edgeHtml}
        ${bookie.complete ? `
          <div class="card-progress-container">
            <div class="card-progress-label">
              <span>Relativna vrednost</span>
              <span>${relPercent.toFixed(0)}%</span>
            </div>
            <div class="card-progress-bar-bg">
              <div class="card-progress-bar-fg" style="width: ${relPercent}%"></div>
            </div>
          </div>
          <button type="button" class="card-copy-btn" data-ticket="${ticketDataStr}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
            Kopiraj tiket
          </button>
        ` : ''}
      </div>
    `;
  }).join('');

  const domesticBookmakers = [
    { id: "merkurxtip", name: "MerkurXtip" },
    { id: "maxbet", name: "MaxBet" },
    { id: "mozzartbet", name: "Mozzart" },
    { id: "balkanbet", name: "BalkanBet" },
    { id: "soccerbet", name: "SoccerBet" },
    { id: "superbet", name: "Superbet" }
  ];
  
  const legsRowsHtml = result.legs.map((leg, index) => {
    let bestDomOdd = 0;
    let lowestDomOdd = Infinity;
    domesticBookmakers.forEach(bookie => {
      const odd = outcomeValue(leg.match.bookmakers?.[bookie.id], leg.outcome);
      if (isValidOdd(odd)) {
        if (Number(odd) > bestDomOdd) bestDomOdd = Number(odd);
        if (Number(odd) < lowestDomOdd) lowestDomOdd = Number(odd);
      }
    });

    const oddCells = domesticBookmakers.map(bookie => {
      const odd = outcomeValue(leg.match.bookmakers?.[bookie.id], leg.outcome);
      const isBest = isValidOdd(odd) && Number(odd) === bestDomOdd;
      const isLowest = isValidOdd(odd) && Number(odd) === lowestDomOdd && bestDomOdd !== lowestDomOdd;
      const cellClass = odd 
        ? (isBest ? 'leg-odd-cell best' : (isLowest ? 'leg-odd-cell lowest' : 'leg-odd-cell'))
        : 'leg-odd-cell missing';
        
      return `<td class="${cellClass}">${formatOdd(odd)}</td>`;
    }).join('');

    const refOddValue = outcomeValue(leg.match.bookmakers?.pinnacle_shin, leg.outcome);

    return `
      <tr>
        <td class="leg-num">${index + 1}</td>
        <td class="leg-match">
          ${leg.match.home} vs ${leg.match.away}
          <small>${formatTime(leg.match.kickOffTime)}</small>
        </td>
        <td class="leg-fav">
          <strong>${leg.team}</strong>
          <span>${leg.customLabel || marketLabels[leg.outcome]}</span>
        </td>
        <td class="ref-odd-cell">${formatOdd(refOddValue)}</td>
        ${oddCells}
      </tr>
    `;
  }).join('');

  els.accumulatorView.innerHTML = `
    <div class="accumulator-leaderboard">
      ${cardsHtml}
    </div>
    
    <div class="accumulator-legs">
      <h3 class="legs-title">Pregled parlay legova (narednih ${result.legs.length} mečeva)</h3>
      <div class="legs-table-wrap">
        <table class="legs-table">
          <thead>
            <tr>
              <th class="leg-num-head">Leg</th>
              <th class="leg-match-head">Meč</th>
              <th class="leg-fav-head">Favorit</th>
              <th>Pinnacle reference</th>
              <th>MerkurXtip</th>
              <th>MaxBet</th>
              <th>Mozzart</th>
              <th>BalkanBet</th>
              <th>SoccerBet</th>
              <th>Superbet</th>
            </tr>
          </thead>
          <tbody>
            ${legsRowsHtml}
          </tbody>
        </table>
      </div>
    </div>
  `;
  
  els.accumulatorView.querySelectorAll(".card-copy-btn").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      const text = btn.dataset.ticket;
      try {
        await copyTextToClipboard(text);
        const originalText = btn.innerHTML;
        btn.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          Kopirano!
        `;
        btn.classList.add("is-copied");
        setTimeout(() => {
          btn.innerHTML = originalText;
          btn.classList.remove("is-copied");
        }, 1500);
      } catch (err) {
        console.error("Clipboard copy failed:", err);
      }
    });
  });
}

function render() {
  renderBookmakerToggles();
  const matches = visibleMatches();
  renderView();
  
  if (state.view === "accumulator") {
    renderAccumulatorView(matches);
  } else {
    renderNoVigLimit();
    renderOddsThreshold();
    renderHead();
    renderRows(matches);
  }
  
  renderSummary(matches);
  updateValueTicker(matches);
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
els.oddsThresholdInput.addEventListener("input", (event) => {
  state.oddsThresholdPercent = Number(event.target.value) || 0;
  renderOddsThreshold();
});
els.viewButtons.forEach((button) => {
  button.addEventListener("click", () => {
    state.view = button.dataset.view || "all";
    render();
  });
});

els.accumulatorXInput.addEventListener("input", (event) => {
  state.accumulatorX = Number(event.target.value) || 4;
  els.accumulatorXValue.textContent = String(state.accumulatorX);
  document.querySelectorAll(".accumulator-presets .preset-btn").forEach(btn => {
    btn.classList.toggle("active", Number(btn.dataset.val) === state.accumulatorX);
  });
  render();
});

els.accumulatorTypeSelect.addEventListener("change", (event) => {
  state.accumulatorType = event.target.value;
  render();
});

document.querySelectorAll(".accumulator-presets .preset-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    state.accumulatorX = Number(btn.dataset.val);
    els.accumulatorXInput.value = String(state.accumulatorX);
    els.accumulatorXValue.textContent = String(state.accumulatorX);
    document.querySelectorAll(".accumulator-presets .preset-btn").forEach(b => {
      b.classList.toggle("active", b === btn);
    });
    render();
  });
});

loadOdds();
setInterval(refreshOddsOnTimer, oddsRefreshMs);
setInterval(renderRefreshCountdown, 1000);
setInterval(checkOutrightAlert, 1000);
