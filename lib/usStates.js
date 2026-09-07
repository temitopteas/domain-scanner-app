// lib/usStates.js
//
// Recognizes US state names and abbreviations in a domain's text. Added
// because city-only matching had a real failure mode: a short, coincidental
// city-name substring (e.g. "Alto" buried inside "reALTOr") could win out
// over an actual, deliberate state reference in the same domain (e.g.
// "Texas" in "TexasRealtor.com"). This checks for states FIRST and
// prioritizes them over shaky city matches — see lib/geoMatch.js for how
// the two are combined.
//
// Full state names ("Texas", "Florida") are matched anywhere in the text —
// safe, since real state names are distinctive words, not coincidental
// fragments. Two-letter abbreviations ("TX", "FL") are far riskier
// (extremely common as coincidental substrings), so those are ONLY
// accepted at the very start or end of the text — matching the real-world
// convention of "TXRealtor.com" or "RealtorTX.com", not a random mid-word
// occurrence.

const STATES = require("../data/us-states.json");

const slugify = (s) => s.toLowerCase().replace(/[^a-z]/g, "");

const stateNameSlugs = STATES.map((s) => ({ ...s, nameSlug: slugify(s.name) }));

/**
 * @param {string} text  lowercase domain text (root, or root with city
 *   already removed)
 * @returns {{label: string, abbr: string, slug: string, matchType: "name"|"abbr"}|null}
 */
function findStateMatch(text) {
  if (!text) return null;

  // Full names first — longest name wins if more than one somehow matches,
  // to reduce the odds of a short name (e.g. "Ohio") being a coincidence
  // inside a longer one.
  let bestNameMatch = null;
  for (const s of stateNameSlugs) {
    if (s.nameSlug.length >= 4 && text.includes(s.nameSlug)) {
      if (!bestNameMatch || s.nameSlug.length > bestNameMatch.nameSlug.length) bestNameMatch = s;
    }
  }
  if (bestNameMatch) {
    return { label: bestNameMatch.name, abbr: bestNameMatch.abbr, slug: bestNameMatch.nameSlug, matchType: "name" };
  }

  // Abbreviations only at the very start or end of the text.
  for (const s of stateNameSlugs) {
    const abbr = s.abbr.toLowerCase();
    if (text.startsWith(abbr) || text.endsWith(abbr)) {
      return { label: s.name, abbr: s.abbr, slug: abbr, matchType: "abbr" };
    }
  }

  return null;
}

module.exports = { findStateMatch };
