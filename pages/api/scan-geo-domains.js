// pages/api/scan-geo-domains.js
//
// For every candidate: recognizes a real US city, pulls your own sales
// stats for that city and for the matched root keyword, and — live — checks
// whether a similar domain (city+root, root+city, etc.) is already
// developed. The city/root matching itself is free and local; the
// "similar domain in use" check is a live internet check, so this is
// capped and run in parallel batches per request, same pattern as the
// Domain Scanner.

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

    // Cap how many domains in this request get the live "similar domain"
    // check — the client's batching loop covers the rest of the list
    // across further requests.
    const MAX_PER_REQUEST = 20;
    const batch = domains.slice(0, MAX_PER_REQUEST);

    const CONCURRENCY = 5;
    const results = [];
    for (let i = 0; i < batch.length; i += CONCURRENCY) {
      const chunk = batch.slice(i, i + CONCURRENCY);
      const chunkResults = await Promise.all(
        chunk.map(async (domain) => {
          const root = rootOf(domain);
          const match = await matchDomain(domain, root, profile);
          return match ? { domain, ...match } : null;
        })
      );
      results.push(...chunkResults.filter(Boolean));
    }

    results.sort((a, b) => {
      if (a.cityConfidence !== b.cityConfidence) return a.cityConfidence === "high" ? -1 : 1;
      return (b.comboSalesCount || b.citySalesCount || 0) - (a.comboSalesCount || a.citySalesCount || 0);
    });

    return res.status(200).json({
      results,
      matchedCount: results.length,
      note:
        domains.length > MAX_PER_REQUEST
          ? `${domains.length - MAX_PER_REQUEST} domains in this batch weren't checked yet (per-request cap, since this involves live internet checks). The app's batching loop covers the rest across further requests.`
          : undefined,
    });
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
