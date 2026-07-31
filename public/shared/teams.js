// Shared team-name normalization and fixture matching.
//
// Imported by both server.js (bundled into the Netlify function by esbuild) and
// public/app.js (served as /shared/teams.js). Keeping one copy is deliberate:
// the browser Pinnacle fallback joins rows by matchKey, so any drift between a
// server-side and client-side alias table silently drops those rows.
//
// Layers, cheapest first:
//   1. canonicalizeTeam  - character-level cleanup (case, diacritics, punctuation)
//   2. TEAM_ALIASES      - curated table for names no algorithm can derive
//                          (exonyms like "holandija" -> Netherlands)
//   3. teamTokens        - token-level cleanup: drop club-type affixes, expand
//                          abbreviations. Handles most club variants generically.
//   4. teamSimilarity    - fuzzy score for whatever the first three layers miss.

const DIACRITIC_REPLACEMENTS = [
  [/[đð]/g, "dj"], // đ ð
  [/ø/g, "o"], // ø
  [/æ/g, "ae"], // æ
  [/œ/g, "oe"], // œ
  [/ß/g, "ss"], // ß
  [/ł/g, "l"], // ł
  [/þ/g, "th"], // þ
];

// Club-type abbreviations and stopwords. Dropped because feeds disagree about
// whether to include them ("Bournemouth" vs "AFC Bournemouth"). Only tokens that
// never distinguish two clubs belong here - "city", "united", "town", "albion",
// "real", "sporting", "borussia" and friends must stay.
const AFFIX_TOKENS = new Set([
  "fc", "fk", "afc", "cfc", "cf", "sc", "scf", "ac", "as", "ss", "ssc", "us", "usc",
  "ca", "cd", "ud", "sd", "rc", "rcd", "rcf", "cp", "gd", "bk", "ik", "if", "sk",
  "nk", "hk", "kv", "sv", "tsv", "tsg", "vfb", "vfl", "fsv", "bsc", "rb", "ogc",
  "osc", "losc", "sco", "fco", "calcio", "club", "de", "del", "futbol", "football",
  "futebol", "sportif",
]);

// Token-level rewrites. Applied before affix stripping so multi-word expansions
// can themselves contain affixes.
const TOKEN_SYNONYMS = new Map([
  ["utd", "united"],
  ["man", "manchester"],
  ["st", "saint"],
  ["spurs", "tottenham"],
  ["nottm", "nottingham"],
  ["wolves", "wolverhampton"],
  ["psg", "paris saint germain"],
  ["mgladbach", "monchengladbach"],
  ["gladbach", "monchengladbach"],
  ["munchen", "munich"],
  ["muenchen", "munich"],
  ["koeln", "koln"],
  ["cologne", "koln"],
  ["turin", "torino"],
  ["milano", "milan"],
  ["napoli", "naples"],
  ["seville", "sevilla"],
  ["atl", "atletico"],
  ["ath", "athletic"],
  ["dep", "deportivo"],
  ["inter", "internazionale"],
]);

// Names no amount of tokenizing recovers: exonyms and clubs whose common short
// form shares no tokens with the full name.
const ALIAS_ENTRIES = [
  // National teams - closed set, curated on purpose.
  ["bih", "Bosnia and Herzegovina"],
  ["b and h", "Bosnia and Herzegovina"],
  ["bandh", "Bosnia and Herzegovina"],
  ["bosnia and herzegovina", "Bosnia and Herzegovina"],
  ["bosnia herzegovina", "Bosnia and Herzegovina"],
  ["bosnia and herz", "Bosnia and Herzegovina"],
  ["bosna i hercegovina", "Bosnia and Herzegovina"],
  ["czech rep", "Czech Republic"],
  ["czech r", "Czech Republic"],
  ["czechia", "Czech Republic"],
  ["ceska", "Czech Republic"],
  ["ceska r", "Czech Republic"],
  ["congo dr", "D.R. Congo"],
  ["congo d r", "D.R. Congo"],
  ["d r congo", "D.R. Congo"],
  ["dr congo", "D.R. Congo"],
  ["democratic republic of congo", "D.R. Congo"],
  ["dem republic of congo", "D.R. Congo"],
  ["dem rep of congo", "D.R. Congo"],
  ["dem rep congo", "D.R. Congo"],
  ["drc", "D.R. Congo"],
  ["d r c", "D.R. Congo"],
  ["rd congo", "D.R. Congo"],
  ["dr kongo", "D.R. Congo"],
  ["demokratska republika kongo", "D.R. Congo"],
  ["demokratska rep kongo", "D.R. Congo"],
  ["kongo dr", "D.R. Congo"],
  ["ir iran", "Iran"],
  ["iran", "Iran"],
  ["irak", "Iraq"],
  ["korea republic", "South Korea"],
  ["juzna koreja", "South Korea"],
  ["s korea", "South Korea"],
  ["skorea", "South Korea"],
  ["turkiye", "Turkey"],
  ["turska", "Turkey"],
  ["usa", "United States"],
  ["u s a", "United States"],
  ["united states of america", "United States"],
  ["sad", "United States"],
  ["alzir", "Algeria"],
  ["australija", "Australia"],
  ["austrija", "Austria"],
  ["belgija", "Belgium"],
  ["engleska", "England"],
  ["egipat", "Egypt"],
  ["ekvador", "Ecuador"],
  ["francuska", "France"],
  ["gana", "Ghana"],
  ["holandija", "Netherlands"],
  ["hrvatska", "Croatia"],
  ["kanada", "Canada"],
  ["katar", "Qatar"],
  ["kolumbija", "Colombia"],
  ["kurasao", "Curacao"],
  ["maroko", "Morocco"],
  ["meksiko", "Mexico"],
  ["nemacka", "Germany"],
  ["novi zeland", "New Zealand"],
  ["n zealand", "New Zealand"],
  ["nzealand", "New Zealand"],
  ["norveska", "Norway"],
  ["obala slonovace", "Ivory Coast"],
  ["cote divoire", "Ivory Coast"],
  ["paragvaj", "Paraguay"],
  ["saudijska arabija", "Saudi Arabia"],
  ["skotska", "Scotland"],
  ["spanija", "Spain"],
  ["svedska", "Sweden"],
  ["svajcarska", "Switzerland"],
  ["tunis", "Tunisia"],
  ["urugvaj", "Uruguay"],
  ["zelenortska ostrva", "Cape Verde"],
  ["juzna afrika", "South Africa"],
  ["s africa", "South Africa"],
  ["safrica", "South Africa"],

  // Near-identical national teams. Listed on both sides so the alias rule in
  // teamSimilarity can hold them apart - a subset name like "Congo" would
  // otherwise score as a match against "D.R. Congo".
  ["congo", "Congo"],
  ["guinea", "Guinea"],
  ["guinea bissau", "Guinea-Bissau"],
  ["equatorial guinea", "Equatorial Guinea"],
  ["north korea", "North Korea"],
  ["korea dpr", "North Korea"],
  ["south korea", "South Korea"],
  ["ireland", "Republic of Ireland"],
  ["republic of ireland", "Republic of Ireland"],
  ["northern ireland", "Northern Ireland"],

  // Clubs whose short form shares no token with the full name.
  ["brighton", "Brighton and Hove Albion"],
  // Same-city clubs, listed on both sides for the same reason as the countries.
  ["milan", "AC Milan"],
  ["ac milan", "AC Milan"],
  ["inter", "Internazionale"],
  ["inter milan", "Internazionale"],
  ["inter milano", "Internazionale"],
  ["internazionale", "Internazionale"],
  ["inter miami", "Inter Miami"],
  ["psg", "Paris Saint-Germain"],
  ["paris sg", "Paris Saint-Germain"],
  ["paris saint germain", "Paris Saint-Germain"],
  ["paris fc", "Paris FC"],
  ["la coruna", "Deportivo La Coruna"],
  ["betis", "Real Betis"],
  ["celta", "Celta Vigo"],
  ["espanyol", "Espanyol"],
  ["monza brianza", "Monza"],
  ["werder", "Werder Bremen"],
  ["schalke", "Schalke 04"],
  ["hamburger", "Hamburger SV"],
  ["frankfurt", "Eintracht Frankfurt"],
  ["dortmund", "Borussia Dortmund"],
  ["leverkusen", "Bayer Leverkusen"],
  ["stuttgart", "Stuttgart"],
  ["freiburg", "Freiburg"],
  ["hoffenheim", "Hoffenheim"],
  ["elversberg", "Elversberg"],
  ["mainz", "Mainz 05"],
];

export function canonicalizeTeam(value) {
  let text = String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  for (const [pattern, replacement] of DIACRITIC_REPLACEMENTS) {
    text = text.replace(pattern, replacement);
  }
  return text
    .replace(/&/g, " and ")
    .replace(/['’`´]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Alias keys run through canonicalizeTeam at load so the table stays consistent
// with lookup, and so entries can be written in readable form.
const TEAM_ALIASES = new Map(
  ALIAS_ENTRIES.map(([key, display]) => [canonicalizeTeam(key), display]),
);

function isNoiseToken(token, index) {
  if (AFFIX_TOKENS.has(token)) return true;
  // Founding years and squad numbers: "Schalke 04", "1899 Hoffenheim", "Mainz 05".
  // A leading 4-digit number is kept - it may be the whole name ("1860 Munich").
  if (/^\d{1,2}$/.test(token)) return true;
  if (/^\d{4}$/.test(token) && index > 0) return true;
  return false;
}

/**
 * Meaningful tokens for a team name, after alias resolution, synonym expansion
 * and affix stripping. Falls back to the raw tokens if stripping empties it.
 */
export function teamTokens(value) {
  const canonical = canonicalizeTeam(value);
  if (!canonical) return [];

  const alias = TEAM_ALIASES.get(canonical);
  const source = alias ? canonicalizeTeam(alias) : canonical;

  const expanded = source
    .split(" ")
    .flatMap((token) => (TOKEN_SYNONYMS.get(token) || token).split(" "))
    .filter(Boolean);

  const stripped = expanded.filter((token, index) => !isNoiseToken(token, index));
  return stripped.length ? stripped : expanded;
}

/** Display name: curated alias when known, otherwise whitespace-tidied input. */
export function normalizeTeamName(value) {
  const clean = String(value ?? "").replace(/\s+/g, " ").trim();
  return TEAM_ALIASES.get(canonicalizeTeam(clean)) || clean;
}

/** Stable comparison key. Two spellings of one team must produce one string. */
export function simplifyTeam(value) {
  return teamTokens(value).join(" ");
}

function bigrams(text) {
  const grams = new Set();
  for (let index = 0; index < text.length - 1; index += 1) {
    grams.add(text.slice(index, index + 2));
  }
  return grams;
}

function intersectionSize(a, b) {
  let size = 0;
  for (const item of a) if (b.has(item)) size += 1;
  return size;
}

/**
 * Similarity of two team names in [0, 1].
 *
 * Blends three signals so no single one dominates:
 *   containment - rewards subsets ("Nottingham" in "Nottingham Forest")
 *   jaccard     - punishes extra tokens, keeping "Manchester United" apart
 *                 from "Manchester City"
 *   dice        - character bigrams, catching typos and truncations
 */
export function teamSimilarity(a, b) {
  // Two curated names that disagree are different teams, full stop. This is the
  // only way to separate "Guinea" / "Guinea-Bissau" from "Nottingham" /
  // "Nottingham Forest": both are a one-token name inside a two-token name, so
  // no amount of string scoring can tell them apart. Listing either side in
  // ALIAS_ENTRIES settles it.
  const aliasA = TEAM_ALIASES.get(canonicalizeTeam(a));
  const aliasB = TEAM_ALIASES.get(canonicalizeTeam(b));
  if (aliasA && aliasB) return aliasA === aliasB ? 1 : 0;

  const tokensA = new Set(teamTokens(a));
  const tokensB = new Set(teamTokens(b));
  if (!tokensA.size || !tokensB.size) return 0;

  const shared = intersectionSize(tokensA, tokensB);
  const containment = shared / Math.min(tokensA.size, tokensB.size);
  const jaccard = shared / (tokensA.size + tokensB.size - shared);

  const textA = [...tokensA].join("");
  const textB = [...tokensB].join("");
  if (textA === textB) return 1;

  const gramsA = bigrams(textA);
  const gramsB = bigrams(textB);
  const gramTotal = gramsA.size + gramsB.size;
  const dice = gramTotal ? (2 * intersectionSize(gramsA, gramsB)) / gramTotal : 0;

  return 0.55 * containment + 0.25 * jaccard + 0.2 * dice;
}

export function toTimestamp(value) {
  if (!value) return null;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

export function createMatchKey(home, away, kickOffTime) {
  const timestamp = toTimestamp(kickOffTime);
  const day = timestamp ? new Date(timestamp).toISOString().slice(0, 10) : "unknown";
  return `${day}:${simplifyTeam(home)}:${simplifyTeam(away)}`;
}

export const DEFAULT_MATCH_OPTIONS = {
  // Both sides of a fixture must clear this. Tuned so "Nottingham" still finds
  // "Nottingham Forest" while "Manchester United" never reaches "Manchester City".
  threshold: 0.72,
  // A win this small over the runner-up is treated as ambiguous and refused:
  // a bare "Manchester" must not silently pick City over United.
  margin: 0.08,
  maxKickoffDriftMs: 8 * 24 * 60 * 60 * 1000,
};

/** Score one fixture against another, trying both orientations. */
export function fixtureSimilarity(offer, row) {
  const straight = Math.min(
    teamSimilarity(offer.home, row.home),
    teamSimilarity(offer.away, row.away),
  );
  const reversed = Math.min(
    teamSimilarity(offer.home, row.away),
    teamSimilarity(offer.away, row.home),
  );
  return reversed > straight
    ? { score: reversed, reversed: true }
    : { score: straight, reversed: false };
}

/**
 * Best row for an offer, or null when nothing is confident enough.
 *
 * Requiring *both* teams to score (via min() in fixtureSimilarity) is what makes
 * fuzzy matching safe here: merging two different fixtures would show unrelated
 * odds side by side, which is worse for a comparison tool than showing no row.
 *
 * Returns { row, reversed, score, runnerUp, reason } - runnerUp and reason are
 * populated on rejection too, so callers can report near misses.
 */
export function findFixtureMatch(offer, rows, options = {}) {
  const { threshold, margin, maxKickoffDriftMs } = { ...DEFAULT_MATCH_OPTIONS, ...options };
  const offerTime = toTimestamp(offer.kickOffTime);

  let best = null;
  let runnerUp = null;

  for (const row of rows) {
    const rowTime = toTimestamp(row.kickOffTime);
    if (offerTime && rowTime && Math.abs(rowTime - offerTime) > maxKickoffDriftMs) continue;

    const { score, reversed } = fixtureSimilarity(offer, row);
    const drift = offerTime && rowTime ? Math.abs(rowTime - offerTime) : Number.MAX_SAFE_INTEGER;
    const candidate = { row, reversed, score, drift };

    // Kickoff proximity only breaks ties between equally-named candidates.
    const beatsBest =
      !best || score > best.score + 1e-9 || (Math.abs(score - best.score) <= 1e-9 && drift < best.drift);
    if (beatsBest) {
      runnerUp = best;
      best = candidate;
    } else if (!runnerUp || score > runnerUp.score) {
      runnerUp = candidate;
    }
  }

  if (!best) return null;
  if (best.score < threshold) {
    return { row: null, score: best.score, runnerUp: best, reason: "below-threshold" };
  }
  // Two candidates scoring within `margin` are only ambiguous if kickoff time
  // failed to separate them too. Identical names at different times (a two-legged
  // tie) are resolved by proximity; different names at the same time are not.
  if (runnerUp && best.score - runnerUp.score < margin && best.drift >= runnerUp.drift) {
    return { row: null, score: best.score, runnerUp, reason: "ambiguous" };
  }

  return { row: best.row, reversed: best.reversed, score: best.score, runnerUp, reason: "matched" };
}
