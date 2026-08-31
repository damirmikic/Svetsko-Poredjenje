import test from "node:test";
import assert from "node:assert/strict";

import { getCompetitionById, matchesCompetitionTermFilters } from "../server.js";

const epl = getCompetitionById("epl");

test("England Premier League accepts only the English top flight", () => {
  const keep = [
    "Premier League",
    "Premijer Liga",
    "England - Premier League",
    "England Premier League",
    "English Premier League",
    "England – Premier League",
    "England 1",
    "Engleska 1",
  ];
  for (const name of keep) {
    assert.equal(matchesCompetitionTermFilters(name, epl), true, `should keep "${name}"`);
  }
});

test("England Premier League rejects other countries' top flights and youth/cup spin-offs", () => {
  const drop = [
    "Egypt Premier League",
    "Egypt - Premier League",
    "Ghana Premier League",
    "Wales Premier League",
    "Kenyan Premier League",
    "Russia - Premier League",
    "Ukraine – Premier League",
    "Belarus - Premier League",
    "Premier League 2",
    "England Premier League 2",
    "U21 Premier League",
    "England U18 Premier League",
    "Premier League Cup",
    "Premier League International Cup",
    "Premier League Summer Series",
    "Premijer Liga BiH",
  ];
  for (const name of drop) {
    assert.equal(matchesCompetitionTermFilters(name, epl), false, `should reject "${name}"`);
  }
});

test("term filter still requires a configured term to match at all", () => {
  assert.equal(matchesCompetitionTermFilters("Serbia SuperLiga", epl), false);
});
