import test from "node:test";
import assert from "node:assert/strict";

import { aggregateMatches, normalizeCompetitionName } from "../server.js";
import { createMatchKey } from "../public/shared/teams.js";

// Kickoff far enough ahead that the "drop matches already started" filter keeps it.
const kickoff = Date.now() + 3 * 24 * 60 * 60 * 1000;

function offer(bookmakerId, home, away, odds, kickOffTime = kickoff) {
  return {
    bookmakerId,
    bookmakerName: bookmakerId,
    source: "test",
    matchKey: createMatchKey(home, away, kickOffTime),
    externalId: `${bookmakerId}-1`,
    home,
    away,
    leagueName: "England - Premier League",
    kickOffTime,
    updatedAt: Date.now(),
    odds,
    totalsByLine: {},
    qualifyOdds: { home: null, away: null },
  };
}

function feed(bookmakerId, matches, sourceOfTruth = false) {
  return {
    bookmaker: { id: bookmakerId, name: bookmakerId, type: "test", sourceOfTruth },
    status: "ok",
    url: "https://example.test",
    matches,
    totalMatches: matches.length,
  };
}

test("joins one fixture across feeds that spell the teams differently", () => {
  const { matches, unmatched } = aggregateMatches([
    feed("pinnacle", [
      offer("pinnacle", "Manchester United", "Wolverhampton Wanderers", {
        home: 1.8, draw: 3.6, away: 4.2,
      }),
    ], true),
    // Each of these spellings failed to join under exact-match normalization.
    feed("maxbet", [
      offer("maxbet", "Man Utd", "Wolves", { home: 1.75, draw: 3.5, away: 4.3 }),
    ]),
    feed("balkanbet", [
      offer("balkanbet", "Manchester Utd FC", "Wolverhampton", { home: 1.82, draw: 3.4, away: 4.1 }),
    ]),
  ]);

  assert.equal(matches.length, 1, "all three feeds should land on one row");
  assert.deepEqual(unmatched, []);

  const row = matches[0];
  assert.equal(row.bookmakers.maxbet.odds.home, 1.75);
  assert.equal(row.bookmakers.balkanbet.odds.home, 1.82);
  // Best price is picked across the joined feeds, which only works once they join.
  assert.equal(row.best.home.value, 1.82);
  assert.equal(row.best.away.value, 4.3);
});

test("flips prices when a feed lists the fixture the other way round", () => {
  const { matches } = aggregateMatches([
    feed("pinnacle", [
      offer("pinnacle", "Arsenal", "Chelsea", { home: 2.1, draw: 3.4, away: 3.5 }),
    ], true),
    feed("maxbet", [
      offer("maxbet", "Chelsea FC", "Arsenal FC", { home: 3.6, draw: 3.3, away: 2.05 }),
    ]),
  ]);

  assert.equal(matches.length, 1);
  const entry = matches[0].bookmakers.maxbet;
  assert.equal(entry.odds.home, 2.05, "Arsenal's price must land in the home column");
  assert.equal(entry.odds.away, 3.6);
});

test("reports an unrecognised team instead of dropping it silently", () => {
  const { matches, unmatched } = aggregateMatches([
    feed("pinnacle", [
      offer("pinnacle", "Real Madrid", "Barcelona", { home: 2.2, draw: 3.5, away: 3.1 }),
    ], true),
    feed("maxbet", [
      offer("maxbet", "Rayo Vallecano", "Getafe", { home: 2.4, draw: 3.2, away: 3.0 }),
    ]),
  ]);

  assert.equal(matches.length, 1);
  assert.equal(unmatched.length, 1);
  assert.equal(unmatched[0].bookmakerId, "maxbet");
  assert.equal(unmatched[0].home, "Rayo Vallecano");
  assert.ok(unmatched[0].reason);
});

test("empty league name falls through instead of defaulting to World Cup", () => {
  // Regression: normalizeCompetitionName used to hardcode "World Cup 2026" as
  // its own fallback for empty input, which made every call site's
  // `|| competition.label` dead code - an orphan Ligue 1 fixture (unmatched
  // due to a name variant, or with no leagueName field on that feed) rendered
  // labelled "World Cup 2026" regardless of which competition tab it came from.
  assert.equal(normalizeCompetitionName(""), "");
  assert.equal(normalizeCompetitionName(null), "");
  assert.equal(normalizeCompetitionName("") || "France - Ligue 1", "France - Ligue 1");
  assert.equal(normalizeCompetitionName("Fifa World Cup"), "World Cup 2026");
  assert.equal(normalizeCompetitionName("England - Premier League"), "England - Premier League");
});

test("never merges two different fixtures kicking off together", () => {
  const { matches } = aggregateMatches([
    feed("pinnacle", [
      offer("pinnacle", "Manchester United", "Everton", { home: 1.9, draw: 3.5, away: 4.0 }),
      offer("pinnacle", "Manchester City", "Brentford", { home: 1.3, draw: 5.5, away: 9.0 }),
    ], true),
    feed("maxbet", [
      offer("maxbet", "Man City", "Brentford FC", { home: 1.32, draw: 5.4, away: 9.2 }),
    ]),
  ]);

  assert.equal(matches.length, 2);
  const city = matches.find((match) => match.home === "Manchester City");
  const united = matches.find((match) => match.home === "Manchester United");
  assert.equal(city.bookmakers.maxbet.odds.home, 1.32);
  // The critical assertion: City's price must not leak onto United's row.
  assert.equal(united.bookmakers.maxbet.odds.home, null);
});
