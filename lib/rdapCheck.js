// lib/rdapCheck.js
//
// Checks whether a domain is registered — completely free, no API key.
// RDAP (Registration Data Access Protocol) is the modern, open replacement
// for WHOIS that every registry supports. rdap.org is a free public
// bootstrap service that routes the lookup to the right registry for you.

const EXTENSIONS = ["com", "ai", "io", "co", "app", "tech", "dev", "us"];

// Simple in-memory cache so a single run doesn't re-check the same domain
// twice. Doesn't persist across separate runs (that would need a database),
// but costs nothing and needs no setup.
const cache = new Map();

async function isRegistered(fullDomain) {
  if (cache.has(fullDomain)) return cache.get(fullDomain);

  let registered;
  try {
    const res = await fetch(`https://rdap.org/domain/${fullDomain}`, {
      headers: { Accept: "application/rdap+json" },
    });
    // RDAP returns 404 for an unregistered domain, 200 with details for a registered one
    registered = res.status === 200;
  } catch (e) {
    // Network hiccup or unsupported TLD — treat as unknown rather than guessing
    registered = null;
  }

  cache.set(fullDomain, registered);
  return registered;
}

/**
 * @param {string} root  e.g. "smart" (no extension)
 * @returns {Promise<{ext: string, registered: boolean|null}[]>}
 */
async function checkExtensions(root) {
  // All 8 extensions for ONE domain, checked at once — this is what was
  // making things feel stuck: checking them one at a time meant every
  // domain waited on up to 8 sequential round-trips before moving on.
  return Promise.all(
    EXTENSIONS.map(async (ext) => ({ ext, registered: await isRegistered(`${root}.${ext}`) }))
  );
}

module.exports = { checkExtensions, EXTENSIONS };
