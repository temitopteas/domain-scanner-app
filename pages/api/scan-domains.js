// pages/api/scan-domains.js
//
// Fully free pipeline, exactly 4 checks per candidate domain:
// 1. Pattern match — does the name match your friend's naming patterns?
//    (free, local, instant — see lib/patternScore.js)
// 2. Extension registration — the SAME domain root, checked against all
//    ~150 curated TLDs (lib/geoTlds.js). Reports how many are registered.
// 3. Live website count — of the registered ones, how many are an actual
//    live, developed site (not parked/for-sale)?
// 4. Which extensions are live — the specific list (e.g. ".co, .ca, .io").
//
// No paid APIs, no subscriptions. Output is raw data — you make the final
// call, nothing is auto-scored by an LLM.

const { buildPatternProfile } = require("../../lib/salesData");
const { scoreAndFilter } = require("../../lib/patternScore");
const { checkExtensions } = require("../../lib/rdapCheck");
const { checkSite } = require("../../lib/siteCheck");

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  const { domains, salesData, threshold = 6.0, groundSurvivors = true, skipPatternFilter = false } = req.body;

  if (!Array.isArray(domains) || !Array.isArray(salesData)) {
    return res.status(400).json({ error: "domains and salesData must be arrays" });
  }

  try {
    // Check 1: free, local, instant
    const profile = buildPatternProfile(salesData);
    const survivors = scoreAndFilter(domains, profile, threshold, skipPatternFilter);

    if (survivors.length === 0) {
      return res.status(200).json({ results: [], survivorCount: 0 });
    }

    if (!groundSurvivors) {
      return res.status(200).json({ results: survivors, survivorCount: survivors.length });
    }

    // Checks 2-4: live internet checks. Capped per-request so one request
    // can't run long enough to hit a hosting platform's request time limit
    // (e.g. Vercel's free tier cuts a request off at 10 seconds) — each
    // domain now checks ~150 TLDs, so this stays small.
    const MAX_GROUNDING_PER_REQUEST = 3;
    const toGround = survivors.slice(0, MAX_GROUNDING_PER_REQUEST);
    const ungrounded = survivors.slice(MAX_GROUNDING_PER_REQUEST);

    const grounded = await Promise.all(
      toGround.map(async (s) => {
        // Check 2: same root, every TLD — cheap registration check first
        const extensions = await checkExtensions(s.root);
        const registeredExtensions = extensions.filter((e) => e.registered).map((e) => e.ext);

        // Check 3 & 4: of the registered ones, which are actually live —
        // only fetches full page content for the registered subset, not
        // all ~150.
        const siteResults = await Promise.all(
          registeredExtensions.map((ext) => checkSite(`${s.root}.${ext}`))
        );
        const liveExtensions = siteResults
          .filter((r) => r.looksDeveloped)
          .map((r) => r.domain.split(".").slice(1).join("."));

        return {
          ...s,
          extensionsRegisteredCount: registeredExtensions.length,
          liveWebsiteCount: liveExtensions.length,
          liveExtensions: liveExtensions.join(", "),
        };
      })
    );

    // Domains beyond the per-request cap are NOT silently dropped — they're
    // still returned with their pattern score, just without checks 2-4.
    // Re-running with a higher threshold shrinks the survivor list so more
    // domains get the full check per request.
    const ungroundedRows = ungrounded.map((s) => ({
      ...s,
      extensionsRegisteredCount: null,
      liveWebsiteCount: null,
      liveExtensions: "",
      note: "Not live-checked this request (per-request cap) — pattern score only.",
    }));

    return res.status(200).json({
      results: [...grounded, ...ungroundedRows],
      survivorCount: survivors.length,
      groundedCount: grounded.length,
      note:
        ungrounded.length > 0
          ? `${ungrounded.length} survivors in this batch weren't live-checked (per-request cap) — they're included with pattern score only. Raise the threshold to shrink the survivor list so more get the full check.`
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

// Requests a longer serverless function timeout on platforms that support
// it (e.g. Vercel Pro allows up to 60s standard). Vercel's free Hobby tier
// caps every function at 10s regardless of this setting — that's exactly
// why the batch sizes and concurrency above are tuned to fit inside that.
export const maxDuration = 60;
