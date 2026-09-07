// lib/rdapCheck.js
//
// Checks whether a domain is registered — free, no API key. Queries each
// TLD's own registry RDAP server directly (via IANA's public bootstrap
// file, lib/rdapBootstrap.js) rather than going through rdap.org's shared
// proxy, which has a hard 10-requests-per-10-seconds limit that our
// ~150-TLD checks were blowing straight through — that was the actual
// cause of every domain (even apple.com) showing 0 registered extensions.
// Falls back to rdap.org only for the rare TLD not found in the bootstrap.

const { TLDS } = require("./geoTlds");
const { loadBootstrap } = require("./rdapBootstrap");

const cache = new Map();

async function isRegistered(fullDomain) {
  if (cache.has(fullDomain)) return cache.get(fullDomain);

  const tld = fullDomain.split(".").pop().toLowerCase();
  const bootstrap = await loadBootstrap();
  const baseUrl = bootstrap.get(tld);
  const url = baseUrl ? `${baseUrl}domain/${fullDomain}` : `https://rdap.org/domain/${fullDomain}`;

  let registered;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    const res = await fetch(url, {
      headers: { Accept: "application/rdap+json" },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    // RDAP returns 404 for an unregistered domain, 200 with details for a registered one
    registered = res.status === 200;
  } catch (e) {
    // Network hiccup, timeout, or unsupported TLD — treat as unknown rather than guessing
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
  // All TLDs for ONE domain, checked at once — but now each goes to its
  // own registry's server (via the bootstrap map), not one shared proxy,
  // so this no longer trips a single service's rate limit.
  return Promise.all(
    TLDS.map(async (ext) => ({ ext, registered: await isRegistered(`${root}.${ext}`) }))
  );
}

module.exports = { checkExtensions, EXTENSIONS: TLDS };
