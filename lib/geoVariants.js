// lib/geoVariants.js
//
// Generates the common geo-domain naming patterns (city+root, root+city,
// root+city+root, state+root, root+state, root+state+root) for a matched
// city/state/root-keyword combination, then checks each one against the
// live internet to see if someone else already built a site on it — using
// the same free, keyless site-check as the other tools (lib/siteCheck.js).

const { checkSite } = require("./siteCheck");

/**
 * @param {string} citySlug
 * @param {string} stateAbbr  2-letter, lowercase (may be empty if unknown)
 * @param {string} rootSlug
 * @returns {string[]}  candidate .com domains (no protocol, includes .com)
 */
function generateGeoVariants(citySlug, stateAbbr, rootSlug) {
  const variants = new Set();

  if (citySlug && rootSlug) {
    variants.add(`${citySlug}${rootSlug}.com`);
    variants.add(`${rootSlug}${citySlug}.com`);
    variants.add(`${rootSlug}${citySlug}${rootSlug}.com`);
  }

  if (stateAbbr && rootSlug) {
    const s = stateAbbr.toLowerCase();
    variants.add(`${s}${rootSlug}.com`);
    variants.add(`${rootSlug}${s}.com`);
    variants.add(`${rootSlug}${s}${rootSlug}.com`);
  }

  return [...variants];
}

/**
 * Checks all generated variants and returns only the ones that look like a
 * real, developed site (not the candidate's own domain, not a parking page).
 * @param {string} citySlug
 * @param {string} stateAbbr
 * @param {string} rootSlug
 * @param {string} excludeDomain  the candidate domain itself, so it isn't reported as "in use" against itself
 */
async function checkSimilarDomainsInUse(citySlug, stateAbbr, rootSlug, excludeDomain) {
  const variants = generateGeoVariants(citySlug, stateAbbr, rootSlug).filter((v) => v !== excludeDomain);
  if (variants.length === 0) return [];

  const results = await Promise.all(variants.map((v) => checkSite(v)));
  return results.filter((r) => r.looksDeveloped).map((r) => ({ domain: r.domain, title: r.title }));
}

module.exports = { generateGeoVariants, checkSimilarDomainsInUse };
