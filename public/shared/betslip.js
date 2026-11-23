// Pure betslip math, shared by the browser (app.js) and node tests.
// A selection is { key, odds: { [bookmakerId]: number } }.

function validOdd(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 1 ? numeric : null;
}

/**
 * Computes the combined (multiplied) odds of a betslip for each bookmaker.
 *
 * @param {Array<{key: string, odds: Record<string, number>}>} selections
 * @param {string[]} bookmakerIds bookmakers to rank (references excluded by the caller)
 * @returns {{
 *   perBookmaker: Array<{bookmakerId: string, total: number|null, covered: number, missing: string[], complete: boolean}>,
 *   best: {bookmakerId: string, total: number}|null,
 *   bestCombo: {total: number, legs: Array<{key: string, bookmakerId: string, value: number}>}|null,
 * }}
 */
export function computeBetslip(selections, bookmakerIds) {
  const list = Array.isArray(selections) ? selections : [];
  if (!list.length) return { perBookmaker: [], best: null, bestCombo: null };

  const perBookmaker = bookmakerIds.map((bookmakerId) => {
    let total = 1;
    let covered = 0;
    const missing = [];
    for (const selection of list) {
      const value = validOdd(selection.odds?.[bookmakerId]);
      if (value === null) {
        missing.push(selection.key);
      } else {
        total *= value;
        covered += 1;
      }
    }
    const complete = missing.length === 0;
    return { bookmakerId, total: covered ? total : null, covered, missing, complete };
  });

  perBookmaker.sort((a, b) => {
    if (a.complete !== b.complete) return a.complete ? -1 : 1;
    if (a.covered !== b.covered) return b.covered - a.covered;
    return (b.total ?? 0) - (a.total ?? 0);
  });

  const bestRow = perBookmaker.find((row) => row.complete);
  const best = bestRow ? { bookmakerId: bestRow.bookmakerId, total: bestRow.total } : null;

  // Highest odd per leg, mixing bookmakers (only possible if every leg has an offer).
  const legs = [];
  for (const selection of list) {
    let leg = null;
    for (const bookmakerId of bookmakerIds) {
      const value = validOdd(selection.odds?.[bookmakerId]);
      if (value !== null && (!leg || value > leg.value)) leg = { key: selection.key, bookmakerId, value };
    }
    legs.push(leg);
  }
  const bestCombo = legs.every(Boolean)
    ? { total: legs.reduce((acc, leg) => acc * leg.value, 1), legs }
    : null;

  return { perBookmaker, best, bestCombo };
}
