import test from "node:test";
import assert from "node:assert/strict";

import {
  createMatchKey,
  findFixtureMatch,
  normalizeTeamName,
  simplifyTeam,
  teamSimilarity,
} from "../public/shared/teams.js";

const sameTeam = (a, b) =>
  assert.equal(simplifyTeam(a), simplifyTeam(b), `${a} should normalize to ${b}`);

test("collapses club-type affixes that feeds disagree about", () => {
  sameTeam("AFC Bournemouth", "Bournemouth");
  sameTeam("1. FC Köln", "FC Koln");
  sameTeam("VfB Stuttgart", "Stuttgart");
  sameTeam("Schalke 04", "Schalke");
  sameTeam("Mainz 05", "FSV Mainz");
  sameTeam("AS Roma", "Roma");
  sameTeam("US Lecce", "Lecce");
  sameTeam("RCD Espanyol", "Espanyol");
  sameTeam("Torino FC", "Torino");
});

test("resolves French club demonyms that share no token with the city name", () => {
  // Regression: these scored 0.067-0.107 against a 0.72 threshold before the
  // rennais/brestois/lyonnais token synonyms were added - a bare fuzzy score
  // never finds them because the adjectival form shares no substring with the
  // city name at all. Similarity, not sameTeam(): "Stade Rennais" legitimately
  // keeps an extra "stade" token that plain "Rennes" doesn't have, so the two
  // token sets are never identical - what matters is that they still clear
  // the accept threshold via containment.
  assert.ok(teamSimilarity("Stade Rennais", "Rennes") >= 0.72);
  assert.ok(teamSimilarity("Stade Rennais FC", "Rennes") >= 0.72);
  assert.ok(teamSimilarity("Stade Brestois", "Brest") >= 0.72);
  assert.ok(teamSimilarity("Olympique Lyonnais", "Lyon") >= 0.72);
});

test("expands the abbreviations feeds use", () => {
  sameTeam("Man Utd", "Manchester United");
  sameTeam("Manchester Utd", "Manchester United");
  sameTeam("Atl Madrid", "Atletico Madrid");
  sameTeam("Ath Bilbao", "Athletic Bilbao");
  sameTeam("Inter Milan", "Internazionale");
  sameTeam("M'gladbach", "Monchengladbach");
});

test("strips diacritics and alternate transliterations", () => {
  sameTeam("Bayern München", "Bayern Munchen");
  sameTeam("Bayern München", "Bayern Munich");
  sameTeam("Beşiktaş", "Besiktas");
  sameTeam("Crvena Zvezda", "Crvena zvezda");
});

test("resolves exonyms that no algorithm could derive", () => {
  assert.equal(normalizeTeamName("Holandija"), "Netherlands");
  assert.equal(normalizeTeamName("Nemacka"), "Germany");
  assert.equal(normalizeTeamName("BiH"), "Bosnia and Herzegovina");
  assert.equal(normalizeTeamName("B&H"), "Bosnia and Herzegovina");
  assert.equal(normalizeTeamName("Korea Republic"), "South Korea");
  sameTeam("SAD", "United States");
  sameTeam("Turkiye", "Turska");
  assert.equal(normalizeTeamName("Hapoel Be`er Sheva FC"), "Hapoel Beer Sheva");
  assert.equal(normalizeTeamName("FK Crvena Zvezda Belgrade"), "Red Star Belgrade");
  assert.equal(normalizeTeamName("Olympiacos Piraeus"), "Olympiakos Piraeus");
  assert.equal(normalizeTeamName("Bodoe/Glimt"), "Bodo-Glimt");
  assert.equal(normalizeTeamName("AGF Aarhus"), "AGF Aarhus");
  assert.equal(normalizeTeamName("Sabah Masazir"), "Sabah Masazir");
});

test("leaves unknown names intact rather than mangling them", () => {
  assert.equal(normalizeTeamName("  Rakow   Czestochowa "), "Rakow Czestochowa");
  assert.equal(simplifyTeam(""), "");
  assert.equal(simplifyTeam(null), "");
});

test("keeps genuinely different clubs apart", () => {
  // The expensive failure mode: merging two fixtures shows unrelated odds
  // side by side. These must all stay below the 0.72 accept threshold.
  assert.ok(teamSimilarity("Manchester United", "Manchester City") < 0.72);
  assert.ok(teamSimilarity("Real Madrid", "Atletico Madrid") < 0.72);
  assert.ok(teamSimilarity("Borussia Dortmund", "Borussia Monchengladbach") < 0.72);
  assert.ok(teamSimilarity("Sheffield United", "Sheffield Wednesday") < 0.72);
  assert.ok(teamSimilarity("Nottingham Forest", "Nottingham County") < 0.72);
});

test("uses the curated table to separate look-alike names", () => {
  // "Guinea" vs "Guinea-Bissau" is structurally identical to "Nottingham" vs
  // "Nottingham Forest" - one token inside two. Only the curated table can say
  // which is which, so listing both sides must win over the fuzzy score.
  assert.equal(teamSimilarity("Guinea", "Guinea-Bissau"), 0);
  assert.equal(teamSimilarity("Congo", "D.R. Congo"), 0);
  assert.equal(teamSimilarity("AC Milan", "Inter Milan"), 0);
  assert.equal(teamSimilarity("Paris Saint-Germain", "Paris FC"), 0);
  assert.equal(teamSimilarity("Republic of Ireland", "Northern Ireland"), 0);
  // ...while two spellings of one curated name stay identical.
  assert.equal(teamSimilarity("Inter", "Internazionale"), 1);
  assert.equal(teamSimilarity("Holandija", "Netherlands"), 1);
});

test("recognises short forms of the same club", () => {
  assert.ok(teamSimilarity("Nottingham Forest", "Nottingham Forest FC") >= 0.72);
  assert.ok(teamSimilarity("Tottenham", "Tottenham Hotspur") >= 0.72);
  assert.ok(teamSimilarity("Olympique Marseille", "Marseille") >= 0.72);
  assert.ok(teamSimilarity("Wolverhampton Wanderers", "Wolves") >= 0.72);
});

const kickoff = Date.UTC(2026, 5, 12, 18, 0);
const rows = [
  { home: "Manchester United", away: "Arsenal", kickOffTime: kickoff },
  { home: "Manchester City", away: "Everton", kickOffTime: kickoff },
];

test("matches a fixture through spelling differences", () => {
  const result = findFixtureMatch(
    { home: "Man Utd", away: "Arsenal FC", kickOffTime: kickoff },
    rows,
  );
  assert.equal(result.reason, "matched");
  assert.equal(result.row.home, "Manchester United");
  assert.equal(result.reversed, false);
});

test("detects a reversed fixture", () => {
  const result = findFixtureMatch(
    { home: "Arsenal", away: "Man Utd", kickOffTime: kickoff },
    rows,
  );
  assert.equal(result.reason, "matched");
  assert.equal(result.row.home, "Manchester United");
  assert.equal(result.reversed, true);
});

test("refuses an ambiguous name instead of guessing", () => {
  // "Manchester" alone scores well against both rows. Picking one would put
  // City's odds on United's row, so the match is rejected.
  const result = findFixtureMatch(
    { home: "Manchester", away: "Arsenal", kickOffTime: kickoff },
    [
      { home: "Manchester United", away: "Arsenal", kickOffTime: kickoff },
      { home: "Manchester City", away: "Arsenal", kickOffTime: kickoff },
    ],
  );
  assert.equal(result.row, null);
  assert.equal(result.reason, "ambiguous");
});

test("reports a near miss instead of silently dropping it", () => {
  const result = findFixtureMatch(
    { home: "Newcastle Jets", away: "Sydney FC", kickOffTime: kickoff },
    rows,
  );
  assert.equal(result.row, null);
  assert.equal(result.reason, "below-threshold");
  // The caller needs the runner-up to explain the drop in diagnostics.
  assert.ok(result.runnerUp.row);
  assert.ok(result.score < 0.72);
});

test("ignores candidates outside the kickoff window", () => {
  const result = findFixtureMatch(
    { home: "Man Utd", away: "Arsenal", kickOffTime: kickoff + 30 * 24 * 60 * 60 * 1000 },
    rows,
  );
  assert.equal(result, null);
});

test("prefers the closest kickoff when names tie", () => {
  const twoLegs = [
    { home: "Manchester United", away: "Arsenal", kickOffTime: kickoff },
    { home: "Manchester United", away: "Arsenal", kickOffTime: kickoff + 3 * 24 * 60 * 60 * 1000 },
  ];
  const result = findFixtureMatch(
    { home: "Man Utd", away: "Arsenal", kickOffTime: kickoff + 60 * 60 * 1000 },
    twoLegs,
  );
  assert.equal(result.reason, "matched");
  assert.equal(result.row.kickOffTime, kickoff);
});

test("match keys agree across spelling variants", () => {
  assert.equal(
    createMatchKey("Man Utd", "Arsenal FC", kickoff),
    createMatchKey("Manchester United", "Arsenal", kickoff),
  );
  // Server feeds send ISO strings, the browser fallback sends epoch millis.
  assert.equal(
    createMatchKey("Bayern München", "Koln", "2026-06-12T18:00:00.000Z"),
    createMatchKey("Bayern Munich", "1. FC Köln", kickoff),
  );
});
