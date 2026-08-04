// lib/geoMatch.js
//
// For every candidate domain:
// 1. Is this domain name a real US city at all? (checked against the full
//    US cities reference list in lib/usCities.js) — if not, it's dropped
//    before anything else runs.
// 2. How many times have YOU personally sold in that city? (your own
//    sales spreadsheet, lib/geoSalesData.js)
// 3. What root keyword does the domain contain, and how many times has
//    that root keyword sold (across any city), and at what average price?
// 4. Does a "similar domain" already exist and look developed? — checked
//    live, using the naming patterns from lib/geoVariants.js.

const { findBestCityMatch } = require("./usCities");
const { checkSimilarDomainsInUse } = require("./geoVariants");

function findBestRootMatch(root, rootStats) {
  let best = null;
  for (const [slug, entry] of rootStats.entries()) {
    if (slug.length >= 3 && root.includes(slug)) {
      if (!best || slug.length > best.slug.length) best = { slug, ...entry };
    }
  }
  return best;
}

/**
 * @param {string} domain  full domain, e.g. "ModestoRugCleaning.com"
 * @param {string} root  lowercase domain root, no extension
 * @param {{cityStats: Map, rootStats: Map, comboStats: Map}} profile  from YOUR sales sheet
 * @returns {Promise<object|null>}  null if the domain isn't a recognized US city at all
 */
async function matchDomain(domain, root, profile) {
  const cityHit = findBestCityMatch(root);
  if (!cityHit) return null; // not a real US city name — drop it before anything else

  const ownCityStats = profile.cityStats.get(cityHit.slug) || null;
  const rootMatch = findBestRootMatch(root, profile.rootStats);

  let comboMatch = null;
  if (rootMatch) {
    comboMatch = profile.comboStats.get(`${cityHit.slug}|${rootMatch.slug}`) || null;
  }

  // Prefer the state recorded in YOUR OWN sales sheet for this city (most
  // accurate for how you actually refer to it); fall back to the first
  // state the official city list has for this name.
  const stateAbbr = (ownCityStats && ownCityStats.state) || cityHit.states[0] || "";

  let similarDomainsInUse = [];
  if (rootMatch) {
    try {
      similarDomainsInUse = await checkSimilarDomainsInUse(cityHit.slug, stateAbbr, rootMatch.slug, domain.toLowerCase());
    } catch (e) {
      similarDomainsInUse = [];
    }
  }

  const hasCorroboration = Boolean(ownCityStats) || Boolean(rootMatch);
  const cityConfidence = cityHit.slug.length >= 6 || hasCorroboration ? "high" : "low";

  return {
    domainCity: `${cityHit.label}${stateAbbr ? ", " + stateAbbr : ""}`,
    cityConfidence,
    citySalesCount: ownCityStats ? ownCityStats.count : 0,
    domainRootWord: rootMatch ? rootMatch.label : null,
    rootSalesCount: rootMatch ? rootMatch.count : null,
    rootAvgPrice: rootMatch ? rootMatch.avgPrice : null,
    comboSalesCount: comboMatch ? comboMatch.count : null,
    comboAvgPrice: comboMatch ? comboMatch.avgPrice : null,
    similarDomainsInUse: similarDomainsInUse.map((v) => v.domain).join(", "),
  };
}

module.exports = { matchDomain };
