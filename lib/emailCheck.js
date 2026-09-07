// lib/emailCheck.js
//
// Free email checks: syntax validation + a DNS MX record lookup (does the
// domain have mail servers configured at all).
//
// This uses DNS-over-HTTPS (Google's public, free, keyless DoH endpoint)
// as the primary method, NOT Node's built-in dns module. Node's dns module
// depends on your operating system's network DNS resolver, which can be
// blocked or misbehave behind certain firewalls/VPNs/networks (this is
// what was causing every single email — even @gmail.com — to wrongly show
// "no mail server" earlier). DNS-over-HTTPS runs over plain HTTPS (the
// same port everything else in this app already uses), so it's far more
// reliable across different networks. Node's dns module is kept only as a
// fallback if the HTTPS lookup itself fails.

const dns = require("dns").promises;

const FREE_PROVIDERS = ["gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com"];
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const mxCache = new Map();

async function mxViaDoH(domain) {
  const res = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=MX`, {
    headers: { Accept: "application/dns-json" },
  });
  if (!res.ok) throw new Error(`DoH lookup failed: ${res.status}`);
  const data = await res.json();
  // Status 0 = NOERROR. Answer array present with MX records means mail is configured.
  return Array.isArray(data.Answer) && data.Answer.length > 0;
}

async function mxViaNodeDns(domain) {
  const records = await dns.resolveMx(domain);
  return records.length > 0;
}

/**
 * @returns {boolean|null}  true/false if we got a real answer, null if both
 *   lookup methods failed (network issue) — callers should NOT treat null
 *   as "no mail server", since that's an unknown, not a negative result.
 */
async function hasMxRecord(domain) {
  if (mxCache.has(domain)) return mxCache.get(domain);

  let result;
  try {
    result = await mxViaDoH(domain);
  } catch (e) {
    try {
      result = await mxViaNodeDns(domain);
    } catch (e2) {
      result = null; // genuinely couldn't determine — not the same as "no mail server"
    }
  }

  mxCache.set(domain, result);
  return result;
}

/**
 * @param {string} email
 */
async function checkEmail(email) {
  const validSyntax = EMAIL_REGEX.test(email);
  if (!validSyntax) {
    return { email, validSyntax: false, hasMx: false, isFreeProvider: false, domainPart: null };
  }

  const domainPart = email.split("@")[1].toLowerCase();
  const isFreeProvider = FREE_PROVIDERS.includes(domainPart);
  const hasMx = await hasMxRecord(domainPart);

  return { email, validSyntax: true, hasMx, isFreeProvider, domainPart };
}

module.exports = { checkEmail };
