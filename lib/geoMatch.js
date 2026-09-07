// lib/geoMatch.js
//
// For every candidate domain:
// 1. Is this domain name a real US city OR state? Cities are checked
//    against a bundled list of 20,000+ US cities; states (full names AND
//    abbreviations) against all 50 states. If a city match is short and
//    has nothing backing it up, a real state match in the same domain is
//    trusted INSTEAD — this fixes a real failure mode where a coincidental
//    short city substring (e.g. "Alto" inside "reALTOr") was winning out
//    over an actual, deliberate state reference (e.g. "Texas" in
//    "TexasRealtor.com").
// 2. How many times have YOU personally sold in that city/state? (your own
//    sales spreadsheet, lib/geoSalesData.js)
// 3. What's the domain's ACTUAL root phrase — the part of the domain name
//    left over after removing the matched city/state? Sales stats for it
//    are an EXACT match only against your sales sheet — never a borrowed
//    number from a similar-but-different term.
//
// Entirely local — no live checks, no network calls.

const { findBestCityMatch } = require("./usCities");
const { findStateMatch } = require("./usStates");
const { slugify } = require("./geoSalesData");

const EXTENSION_REGEX = /\.(com|ai|io|co|app|net|us|dev)$/i;

/**
 * Removes the matched location's slug from the domain's own text (keeping
 * the ORIGINAL casing of everything else), so what's left is the domain's
 * real root phrase as it was actually typed. Relies on rootOf()
 * lowercasing before stripping the extension (lib/salesData.js), which
 * keeps this and the lowercase `root` the same length and
 * position-aligned, so the same index works on both.
 */
function extractRemainder(domain, root, locationSlug) {
  const domainNoExt = domain.replace(EXTENSION_REGEX, "");
  const index = root.indexOf(locationSlug);
  if (index === -1) return domainNoExt; // shouldn't happen, safety fallback

  const before = domainNoExt.slice(0, index);
  const after = domainNoExt.slice(index + locationSlug.length);
  return (before + after).trim();
}

/**
 * @param {string} domain  full domain, ORIGINAL casing, e.g. "TexasRealtor.com"
 * @param {string} root  lowercase domain root, no extension
 * @param {{cityStats: Map, rootStats: Map, comboStats: Map}} profile  from YOUR sales sheet
 * @returns {object|null}  null if the domain isn't a recognized US city or state at all
 */
function matchDomain(domain, root, profile) {
  const cityHit = findBestCityMatch(root);
  const stateHit = findStateMatch(root);

  if (!cityHit && !stateHit) return null; // no real US city or state name found at all

  // A city match only counts as trustworthy on its own if it's a longer,
  // harder-to-coincidentally-match name, OR your own sales sheet actually
  // has history there. Anything shorter and unbacked defers to a real
  // state match in the same domain, if one exists.
  const ownCityStatsForCityHit = cityHit ? profile.cityStats.get(cityHit.slug) || null : null;
  const cityIsTrustworthy = Boolean(cityHit) && (cityHit.slug.length >= 6 || Boolean(ownCityStatsForCityHit));

  let locationType, locationSlug, locationLabel, stateAbbr;

  if (cityIsTrustworthy) {
    locationType = "city";
    locationSlug = cityHit.slug;
    locationLabel = cityHit.label;
    stateAbbr = (ownCityStatsForCityHit && ownCityStatsForCityHit.state) || cityHit.states[0] || "";
  } else if (stateHit) {
    locationType = "state";
    locationSlug = stateHit.slug;
    locationLabel = stateHit.label;
    stateAbbr = stateHit.abbr;
  } else {
    // No state found either — fall back to the shaky city match; still
    // better than reporting nothing.
    locationType = "city";
    locationSlug = cityHit.slug;
    locationLabel = cityHit.label;
    stateAbbr = cityHit.states[0] || "";
  }

  const ownLocationStats = profile.cityStats.get(locationSlug) || null;

  // The domain's actual root phrase — what's really in the name.
  const remainder = extractRemainder(domain, root, locationSlug);
  const remainderSlug = slugify(remainder);

  // EXACT match only against your sales sheet's root keywords.
  const rootMatch = profile.rootStats.get(remainderSlug) || null;

  let comboMatch = null;
  if (rootMatch) {
    comboMatch = profile.comboStats.get(`${locationSlug}|${remainderSlug}`) || null;
  }

  const domainCity = locationType === "city" ? `${locationLabel}${stateAbbr ? ", " + stateAbbr : ""}` : locationLabel;

  const hasCorroboration = Boolean(ownLocationStats) || Boolean(rootMatch);
  const cityConfidence = locationType === "state" || locationSlug.length >= 6 || hasCorroboration ? "high" : "low";

  return {
    domainCity,
    cityConfidence,
    citySalesCount: ownLocationStats ? ownLocationStats.count : 0,
    domainRootWord: remainder || null,
    rootSalesCount: rootMatch ? rootMatch.count : 0,
    rootAvgPrice: rootMatch ? rootMatch.avgPrice : null,
    comboSalesCount: comboMatch ? comboMatch.count : 0,
    comboAvgPrice: comboMatch ? comboMatch.avgPrice : null,
  };
}

module.exports = { matchDomain };
