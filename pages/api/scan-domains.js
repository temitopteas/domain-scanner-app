// pages/api/scan-domains.js
//
// Fully free pipeline: stage 1 pattern-match (local, free) + stage 2
// grounding using RDAP (free registration check) and direct site fetches
// (free "is this developed" check). No paid APIs, no subscriptions.
// Output is raw data — you make the final call, nothing is auto-scored
// by an LLM.

const { buildPatternProfile } = require("../../lib/salesData");
const { scoreAndFilter } = require("../../lib/patternScore");
const { checkExtensions } = require("../../lib/rdapCheck");
const { checkDomainAndVariants } = require("../../lib/siteCheck");

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  const { domains, salesData, threshold = 6.0, groundSurvivors = true } = req.body;

  if (!Array.isArray(domains) || !Array.isArray(salesData)) {
    return res.status(400).json({ error: "domains and salesData must be arrays" });
  }

  try {
    // Stage 1: free, local, instant
    const profile = buildPatternProfile(salesData);
    const survivors = scoreAndFilter(domains, profile, threshold);

    if (survivors.length === 0) {
      return res.status(200).json({ results: [], survivorCount: 0 });
    }

    if (!groundSurvivors) {
      return res.status(200).json({ results: survivors, survivorCount: survivors.length });
    }

    // Stage 2: free grounding, only on survivors. Capped per-request so a
    // single batch doesn't run for minutes — the client's batching loop
    // handles the rest of the list across further requests.
    const MAX_GROUNDING_PER_REQUEST = 15;
    const toGround = survivors.slice(0, MAX_GROUNDING_PER_REQUEST);

    // Ground several domains at once instead of one at a time — this is
    // the fix for "processing" appearing to hang. A concurrency cap (not
    // all 15 simultaneously) keeps this from hammering the free RDAP
    // service too hard in one burst.
    const CONCURRENCY = 5;
    const grounded = [];
    for (let i = 0; i < toGround.length; i += CONCURRENCY) {
      const chunk = toGround.slice(i, i + CONCURRENCY);
      const chunkResults = await Promise.all(
        chunk.map(async (s) => {
          const [extensions, variantChecks] = await Promise.all([
            checkExtensions(s.root),
            checkDomainAndVariants(s.root),
          ]);
          const takenExtensions = extensions.filter((e) => e.registered).map((e) => e.ext);
          const developedVariants = variantChecks.filter((v) => v.looksDeveloped);

          return {
            ...s,
            takenExtensions,
            extensionCount: takenExtensions.length,
            developedVariants: developedVariants.map((v) => ({ domain: v.domain, title: v.title })),
            anyVariantDeveloped: developedVariants.length > 0,
          };
        })
      );
      grounded.push(...chunkResults);
    }

    return res.status(200).json({
      results: grounded,
      survivorCount: survivors.length,
      groundedCount: grounded.length,
      note:
        survivors.length > MAX_GROUNDING_PER_REQUEST
          ? `${survivors.length - MAX_GROUNDING_PER_REQUEST} survivors in this batch were not grounded (per-request cap, to keep requests fast). Raise the threshold to shrink the survivor list.`
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
