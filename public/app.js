const bookmakerOrder = ["merkurxtip", "maxbet", "superbet", "mozzart", "balkanbet", "soccerbet"];
const outcomeLabels = { home: "1", draw: "X", away: "2" };

const state = {
  data: null,
  enabledBookmakers: new Set(bookmakerOrder),
  search: "",
};

const els = {
  refreshButton: document.querySelector("#refreshButton"),
  bookmakerToggles: document.querySelector("#bookmakerToggles"),
  searchInput: document.querySelector("#searchInput"),
  matchesCount: document.querySelector("#matchesCount"),
  activeFeeds: document.querySelector("#activeFeeds"),
  bestMargin: document.querySelector("#bestMargin"),
  updatedAt: document.querySelector("#updatedAt"),
  resultNote: document.querySelector("#resultNote"),
  oddsHead: document.querySelector("#oddsHead"),
  oddsBody: document.querySelector("#oddsBody"),
  opportunities: document.querySelector("#opportunities"),
  feedStatus: document.querySelector("#feedStatus"),
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

async function loadOdds() {
  setLoading(true);
  try {
    const response = await fetch("/api/odds", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.data = await response.json();
    render();
  } catch (error) {
    els.resultNote.textContent = `Greska pri ucitavanju: ${error.message}`;
  } finally {
    setLoading(false);
  }
}

function setLoading(isLoading) {
  els.refreshButton.disabled = isLoading;
  els.refreshButton.classList.toggle("is-loading", isLoading);
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
    const haystack = `${match.home} ${match.away} ${match.leagueName}`.toLocaleLowerCase("sr-RS");
    return !query || haystack.includes(query);
  });
}

function renderHead() {
  const enabled = bookmakerOrder.filter((id) => state.enabledBookmakers.has(id));
  const bookmakerMap = new Map((state.data?.bookmakers || []).map((bookmaker) => [bookmaker.id, bookmaker]));

  els.oddsHead.innerHTML = `
    <tr>
      <th class="match-head">Mec</th>
      ${enabled
        .map((id) => {
          const bookmaker = bookmakerMap.get(id);
          return `<th colspan="3">${bookmaker?.name || id}</th>`;
        })
        .join("")}
      <th>Margina</th>
    </tr>
    <tr class="subhead">
      <th></th>
      ${enabled
        .map(() =>
          ["home", "draw", "away"].map((outcome) => `<th>${outcomeLabels[outcome]}</th>`).join(""),
        )
        .join("")}
      <th>%</th>
    </tr>
  `;
}

function renderRows(matches) {
  const enabled = bookmakerOrder.filter((id) => state.enabledBookmakers.has(id));

  if (!matches.length) {
    els.oddsBody.innerHTML = `
      <tr>
        <td class="empty-state" colspan="${enabled.length * 3 + 2}">
          <strong>Nema World Cup meceva u aktivnim feedovima.</strong>
          <span>Dashboard je spreman; cim kladionice oznace SP ligu ili market, redovi ce se pojaviti ovde.</span>
        </td>
      </tr>
    `;
    return;
  }

  els.oddsBody.innerHTML = matches
    .map((match) => {
      const oddsCells = enabled
        .map((bookmakerId) => {
          const entry = match.bookmakers[bookmakerId];
          return ["home", "draw", "away"]
            .map((outcome) => {
              const value = entry?.odds?.[outcome];
              const best = match.best?.[outcome];
              const isBest = best?.bookmakerId === bookmakerId && Number(best.value) === Number(value);
              const className = value ? (isBest ? "odd-cell best" : "odd-cell") : "odd-cell missing";
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
    `${matches.length} World Cup mec(eva), ${state.data?.elapsedMs || 0} ms proxy vreme.`;
}

function renderOpportunities(matches) {
  const visibleKeys = new Set(matches.map((match) => match.matchKey));
  const opportunities = (state.data?.opportunities || []).filter((item) => visibleKeys.has(item.matchKey));

  if (!opportunities.length) {
    els.opportunities.innerHTML = `<p class="muted">Nema value signala dok nema World Cup kvota iz feedova.</p>`;
    return;
  }

  els.opportunities.innerHTML = opportunities
    .map(
      (item) => `
        <div class="opportunity">
          <div>
            <strong>${item.label}</strong>
            <span>${item.matchup}</span>
          </div>
          <div>
            <b>${formatOdd(item.value)}</b>
            <small>${item.bookmakerName}${item.edge ? ` +${item.edge}` : ""}</small>
          </div>
        </div>
      `,
    )
    .join("");
}

function renderFeedStatus() {
  const feeds = state.data?.feeds || [];
  els.feedStatus.innerHTML = feeds
    .map(
      (feed) => `
        <div class="feed-row ${feed.status}">
          <span>${feed.bookmakerName}</span>
          <strong>${feed.status}</strong>
          <small>${feed.worldCupMatches}/${feed.totalMatches || 0} WC</small>
        </div>
      `,
    )
    .join("");
}

function render() {
  renderBookmakerToggles();
  const matches = visibleMatches();
  renderHead();
  renderRows(matches);
  renderSummary(matches);
  renderOpportunities(matches);
  renderFeedStatus();
}

els.refreshButton.addEventListener("click", loadOdds);
els.searchInput.addEventListener("input", (event) => {
  state.search = event.target.value;
  render();
});

loadOdds();
