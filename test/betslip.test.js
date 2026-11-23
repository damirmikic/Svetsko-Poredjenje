import test from "node:test";
import assert from "node:assert/strict";
import { computeBetslip } from "../public/shared/betslip.js";

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

test("empty slip returns nothing", () => {
  assert.deepEqual(computeBetslip([], ["a"]), { perBookmaker: [], best: null, bestCombo: null });
});

test("multiplies odds per bookmaker and picks the highest complete total", () => {
  const slip = [
    { key: "m1|home", odds: { a: 2.0, b: 2.1, c: 1.9 } },
    { key: "m2|over25", odds: { a: 1.8, b: 1.7, c: 2.0 } },
  ];
  const result = computeBetslip(slip, ["a", "b", "c"]);
  close(result.perBookmaker.find((r) => r.bookmakerId === "a").total, 3.6);
  close(result.perBookmaker.find((r) => r.bookmakerId === "c").total, 3.8);
  assert.equal(result.best.bookmakerId, "c");
  close(result.best.total, 3.8);
  // best mix: b on m1 (2.1) and c on m2 (2.0)
  assert.deepEqual(result.bestCombo.legs.map((l) => l.bookmakerId), ["b", "c"]);
  close(result.bestCombo.total, 4.2);
});

test("bookmakers missing a leg are incomplete and never best", () => {
  const slip = [
    { key: "m1|home", odds: { a: 2.0, b: 5.0 } },
    { key: "m2|away", odds: { a: 3.0, b: null } },
  ];
  const result = computeBetslip(slip, ["a", "b"]);
  const b = result.perBookmaker.find((r) => r.bookmakerId === "b");
  assert.equal(b.complete, false);
  assert.deepEqual(b.missing, ["m2|away"]);
  assert.equal(result.best.bookmakerId, "a");
  assert.equal(result.perBookmaker[0].bookmakerId, "a");
});

test("no complete bookmaker and an uncovered leg", () => {
  const slip = [
    { key: "m1|home", odds: { a: 2.0 } },
    { key: "m2|home", odds: {} },
  ];
  const result = computeBetslip(slip, ["a"]);
  assert.equal(result.best, null);
  assert.equal(result.bestCombo, null);
});
