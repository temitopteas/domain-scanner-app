// lib/rdapBootstrap.js
//
// Root cause of the "everything shows 0 registered" bug: our checks were
// all going through rdap.org's shared free proxy, which Cloudflare limits
// to 10 requests per 10 seconds. Checking ~150 TLDs at once for one domain
// blew way past that — the first ~10 succeeded, everything after got
// rejected, and that rejection was wrongly read as "not registered."
//
// The fix RDAP.org's own documentation recommends: don't go through their
// shared proxy for bulk queries — query each TLD's actual registry
// directly. IANA publishes a free, public "bootstrap" file mapping every
// TLD to its authoritative RDAP server. Fetched once, cached, then each
// TLD check goes straight to ITS OWN registry (Verisign for .com, Identity
// Digital for .info, etc.) — spreading ~150 checks across dozens of
// different servers instead of hitting one shared, rate-limited service
// 150 times.

let bootstrapCache = null;
let bootstrapPromise = null;

async function loadBootstrap() {
  if (bootstrapCache) return bootstrapCache;
  if (bootstrapPromise) return bootstrapPromise;

  bootstrapPromise = (async () => {
    try {
      const res = await fetch("https://data.iana.org/rdap/dns.json");
      const data = await res.json();
      const map = new Map();
      for (const [tlds, urls] of data.services) {
        if (!urls || urls.length === 0) continue;
        const base = urls[0].endsWith("/") ? urls[0] : urls[0] + "/";
        for (const tld of tlds) {
          map.set(tld.toLowerCase(), base);
        }
      }
      bootstrapCache = map;
      return map;
    } catch (e) {
      // Bootstrap fetch failed — return an empty map so every lookup falls
      // back to rdap.org individually rather than crashing the app.
      bootstrapCache = new Map();
      return bootstrapCache;
    }
  })();

  return bootstrapPromise;
}

module.exports = { loadBootstrap };
