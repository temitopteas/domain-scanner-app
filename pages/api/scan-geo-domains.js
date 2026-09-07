// pages/api/scan-geo-domains.js
//
// For every candidate: recognizes a real US city (against a bundled list
// of 20,000+ cities), and pulls your own sales stats for that city and for
// the matched root keyword — an exact match only, never a borrowed/fuzzy
// one. Entirely local computation, no network calls, no live "similar
// domain" checks (that feature was removed — every free approach tried for
// it turned out unreliable or blocked). That means this can process a full
// batch instantly, no per-request cap needed the way the other tools have.

const { buildGeoProfile } = require("../../lib/geoSalesData");
const { matchDomain } = require("../../lib/geoMatch");
const { rootOf } = require("../../lib/salesData");

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  const { domains, geoSales } = req.body;

  if (!Array.isArray(domains) || !Array.isArray(geoSales)) {
    return res.status(400).json({ error: "domains and geoSales must be arrays" });
  }

  try {
    const profile = buildGeoProfile(geoSales);

    const results = domains
      .map((domain) => {
        const root = rootOf(domain);
        const match = matchDomain(domain, root, profile);
        return match ? { domain, ...match } : null;
      })
      .filter(Boolean);

    results.sort((a, b) => {
      if (a.cityConfidence !== b.cityConfidence) return a.cityConfidence === "high" ? -1 : 1;
      return (b.comboSalesCount || b.citySalesCount || 0) - (a.comboSalesCount || a.citySalesCount || 0);
    });

    return res.status(200).json({ results, matchedCount: results.length });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}

export const config = {
  api: {
    bodyParser: { sizeLimit: "5mb" },
  },
};
