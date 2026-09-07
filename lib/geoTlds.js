// lib/geoTlds.js
//
// A curated list of ~150 TLDs that are genuinely open for any business to
// register — picked from a much larger list the user supplied, with
// brand-only/single-company TLDs (.bmw, .chase, .weber, etc.) and
// government/military-restricted ones (.gov, .mil, .edu) excluded, since
// no independent business could ever register those regardless of naming.
// Used by the Domain Scanner (lib/rdapCheck.js) for its extension
// registration check.

const TLDS = require("../data/geo-tlds.json");

module.exports = { TLDS };
