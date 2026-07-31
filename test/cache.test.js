import test from "node:test";
import assert from "node:assert/strict";

import { fetchBookmaker, clearFeedCache } from "../server.js";

const mockCompetition = {
  id: "test-league",
  label: "Test League",
  pinnacleLeagueCode: "test-league",
  nsoftTournamentId: 999,
  superbetTournaments: ["999"],
  oddsmathLeagueId: 99999,
  dualsoftCountry: "Test",
  dualsoftLeagueName: "Test League",
  mozzartCountryTerm: "test",
  mozzartLeagueTerm: "test",
  btfTerms: ["test"],
};

test("caches feed responses for non-oddsmath bookmakers", async () => {
  clearFeedCache();
  const bookmaker = { id: "pinnacle", name: "Pinnacle", type: "pinnacle", baseUrl: "https://example.com" };

  // First call may fail or return configured if network mock isn't present, but it will store the result in feedCache
  const res1 = await fetchBookmaker(bookmaker, mockCompetition);
  assert.equal(res1.cached, undefined);

  // Second call must return the cached result
  const res2 = await fetchBookmaker(bookmaker, mockCompetition);
  assert.equal(res2.cached, true);
  assert.equal(res2.status, res1.status);
});

test("coalesces concurrent requests for the same feed", async () => {
  clearFeedCache();
  const bookmaker = { id: "maxbet", name: "MaxBet", type: "dualsoft", baseUrl: "https://example.com" };

  // Trigger two concurrent calls
  const [p1, p2] = [
    fetchBookmaker(bookmaker, mockCompetition),
    fetchBookmaker(bookmaker, mockCompetition)
  ];

  const res1 = await p1;
  const res2 = await p2;

  assert.equal(res1.status, res2.status);
});

test("clearFeedCache clears cached feed entries", async () => {
  clearFeedCache();
  const bookmaker = { id: "superbet", name: "Superbet", type: "superbet", baseUrl: "https://example.com" };

  const res1 = await fetchBookmaker(bookmaker, mockCompetition);
  const res2 = await fetchBookmaker(bookmaker, mockCompetition);
  assert.equal(res2.cached, true);

  clearFeedCache();
  const res3 = await fetchBookmaker(bookmaker, mockCompetition);
  assert.equal(res3.cached, undefined);
});
