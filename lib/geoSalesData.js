// lib/geoSalesData.js
//
// Turns your own past-sales spreadsheet (domain, city/state, root keyword,
// price) into lookup tables: how many times you've sold in each city, each
// root keyword, and each city+root combination, plus the average price for
// each. Entirely local computation from your own data — no external
// lookups, no city database, no API involved.

function slugify(text) {
  return (text || "")
    .toString()
    .toLowerCase()
    .replace(/[^a-z]/g, ""); // squish multi-word names into one bare word for domain matching, e.g. "Los Angeles" -> "losangeles"
}

function extractCity(cityState) {
  if (!cityState) return "";
  // Handles "Modesto, CA", "Modesto / CA", "Modesto - CA", or just "Modesto"
  return cityState.split(/[,/\-]/)[0].trim();
}

function extractState(cityState) {
  if (!cityState) return "";
  const parts = cityState.split(/[,/\-]/);
  if (parts.length < 2) return "";
  return parts[1].trim().toUpperCase();
}

function addStat(map, key, label, price, state) {
  if (!map.has(key)) {
    map.set(key, { label, count: 0, totalPrice: 0, avgPrice: null, state: state || null });
  }
  const entry = map.get(key);
  entry.count += 1;
  if (Number.isFinite(price)) entry.totalPrice += price;
  if (state && !entry.state) entry.state = state; // keep the first state seen for this city
}

function finalizeAverages(map) {
  for (const entry of map.values()) {
    entry.avgPrice = entry.count > 0 ? Math.round(entry.totalPrice / entry.count) : null;
  }
}

/**
 * @param {Array<{cityState: string, root: string, price: number}>} sales
 */
function buildGeoProfile(sales) {
  const cityStats = new Map();
  const rootStats = new Map();
  const comboStats = new Map();

  for (const sale of sales) {
    const cityLabel = extractCity(sale.cityState);
    const citySlug = slugify(cityLabel);
    const state = extractState(sale.cityState);
    const rootLabel = (sale.root || "").trim();
    const rootSlug = slugify(rootLabel);
    const price = sale.price;

    if (citySlug) addStat(cityStats, citySlug, cityLabel, price, state);
    if (rootSlug) addStat(rootStats, rootSlug, rootLabel, price, null);
    if (citySlug && rootSlug) {
      addStat(comboStats, `${citySlug}|${rootSlug}`, `${cityLabel} / ${rootLabel}`, price, state);
    }
  }

  finalizeAverages(cityStats);
  finalizeAverages(rootStats);
  finalizeAverages(comboStats);

  return { cityStats, rootStats, comboStats };
}

module.exports = { buildGeoProfile, slugify, extractCity, extractState };
