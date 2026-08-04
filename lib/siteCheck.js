// lib/siteCheck.js
//
// Free replacement for "is this developed" search-API grounding: just fetch
// the domain and its close variants directly, and look at what comes back.
// A parked/for-sale page and a real business look very different in the
// raw HTML, which is enough to catch the "QuickSmart.com is live" case
// without paying for a search API.

const PARKING_SIGNALS = [
  "domain for sale",
  "buy this domain",
  "this domain is parked",
  "godaddy",
  "namecheap",
  "sedo",
  "dan.com",
  "checkout.afternic",
  "hugedomains",
];

const cache = new Map();

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
// Common false positives from tracking/analytics scripts and image filenames
// that happen to match the email pattern — filtered out so the output isn't
// cluttered with junk that isn't actually a contact email.
const NOISE_PATTERNS = ["sentry", "wixpress", "example.com", "@2x", "@3x", ".png", ".jpg", ".svg", ".webp"];

function extractEmails(html) {
  const matches = html.match(EMAIL_REGEX) || [];
  const cleaned = matches
    .map((e) => e.toLowerCase())
    .filter((e) => !NOISE_PATTERNS.some((n) => e.includes(n)));
  return [...new Set(cleaned)];
}

async function checkSite(fullDomain) {
  if (cache.has(fullDomain)) return cache.get(fullDomain);

  let result;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(`https://${fullDomain}`, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (domain-research-tool)" },
    });
    clearTimeout(timeout);

    const html = await res.text();
    const lowerHtml = html.toLowerCase();
    const titleMatch = html.match(/<title>(.*?)<\/title>/i);

    const parkingLikely = PARKING_SIGNALS.some((sig) => lowerHtml.includes(sig));

    // Pull any email addresses visible on the page or in mailto: links —
    // run on the raw HTML (not the stripped plain text below) so we still
    // catch addresses inside <a href="mailto:..."> attributes.
    const siteEmails = extractEmails(html);

    // Strip tags/scripts/styles down to plain visible-ish text, for keyword
    // matching (niche/location relevance) without re-fetching the page.
    const plainText = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .toLowerCase();

    result = {
      domain: fullDomain,
      reachable: true,
      statusCode: res.status,
      title: titleMatch ? titleMatch[1].trim().slice(0, 120) : null,
      contentLength: html.length,
      parkingLikely,
      plainText,
      siteEmails,
      // A real, developed site: reachable, not a parking page, and has
      // enough content to not just be a placeholder/holding page.
      looksDeveloped: res.ok && !parkingLikely && html.length > 2000,
    };
  } catch (e) {
    result = {
      domain: fullDomain,
      reachable: false,
      statusCode: null,
      title: null,
      contentLength: 0,
      parkingLikely: false,
      plainText: "",
      siteEmails: [],
      looksDeveloped: false,
    };
  }

  cache.set(fullDomain, result);
  return result;
}

/**
 * Generates close variants worth checking for a root (typo-swap,
 * prefix/suffix swap) — catches your "QuickSmart / SmartQuick" example.
 */
function generateVariants(root) {
  const variants = new Set([root]);

  const mid = Math.ceil(root.length / 2);
  const a = root.slice(0, mid);
  const b = root.slice(mid);
  if (a.length >= 3 && b.length >= 3) variants.add(b + a);

  ["get", "try", "use"].forEach((p) => variants.add(p + root));
  ["hq", "app", "ai", "co"].forEach((s) => variants.add(root + s));

  return [...variants];
}

/**
 * Checks the domain itself plus its generated variants (as .com by default).
 */
async function checkDomainAndVariants(root) {
  const variants = generateVariants(root);
  // All variants for ONE domain, checked at once — same fix as the RDAP
  // extension check: sequential fetches here were the main reason batches
  // felt frozen.
  return Promise.all(variants.map((v) => checkSite(`${v}.com`)));
}

module.exports = { checkSite, generateVariants, checkDomainAndVariants, checkRelevance };

/**
 * Free relevance check: fetches the lead's own company site (from their
 * email domain) and looks for your niche keywords and location keyword in
 * the actual page text. This is literal keyword matching, not reading
 * comprehension — a real match in your niche that phrases things
 * differently (e.g. says "Central Valley" instead of "Modesto") can be
 * missed. Good for catching obvious matches for free; not a substitute for
 * a human (or AI) actually reading the site.
 *
 * @param {string} fullDomain  the lead's company domain (from their email)
 * @param {string[]} nicheKeywords  e.g. ["carpet", "rug", "cleaning"]
 * @param {string[]} locationKeywords  e.g. ["modesto"]
 */
async function checkRelevance(fullDomain, nicheKeywords, locationKeywords) {
  const site = await checkSite(fullDomain);

  if (!site.reachable) {
    return { ...site, nicheMatch: false, locationMatch: false, matchedNicheWords: [], matchedLocationWords: [] };
  }

  const matchedNicheWords = nicheKeywords.filter((kw) =>
    site.plainText.includes(kw.toLowerCase().trim())
  );
  const matchedLocationWords = locationKeywords.filter((kw) =>
    site.plainText.includes(kw.toLowerCase().trim())
  );

  return {
    ...site,
    nicheMatch: matchedNicheWords.length > 0,
    locationMatch: matchedLocationWords.length > 0,
    matchedNicheWords,
    matchedLocationWords,
  };
}
