// lib/patternScore.js
//
// Stage 1: free, local, deterministic scoring of every candidate domain
// against the pattern profile built from your friend's past sales.
// This is what makes 1M domains tractable — nothing here calls an API.

const {
  rootOf,
  looksLikeVowelStrip,
  hasTechAffix,
  looksLikeCompoundWord,
} = require("./salesData");

/**
 * @param {string} domain
 * @param {ReturnType<typeof import('./salesData').buildPatternProfile>} profile
 * @returns {{ domain: string, score: number, patternMatch: string[] }}
 */
function scoreDomain(domain, profile) {
  const root = rootOf(domain);
  const matches = [];
  let score = 0;

  if (looksLikeVowelStrip(root)) {
    matches.push("Phonetic Hack");
    score += weightFor(profile.priceByPattern.vowelStrip);
  }
  if (hasTechAffix(root)) {
    matches.push("AI/Tech Affix");
    score += weightFor(profile.priceByPattern.techAffix);
  }
  if (looksLikeCompoundWord(root)) {
    matches.push("Compound/Brandable");
    score += weightFor(profile.priceByPattern.compound);
  }

  // Length proximity to the sweet spot observed in past sales
  if (profile.avgLength) {
    const lengthDelta = Math.abs(root.length - profile.avgLength);
    score += Math.max(0, 2 - lengthDelta * 0.3);
  }

  // Cap at 10, normalize
  score = Math.min(10, Math.round(score * 10) / 10);

  return { domain, root, score, patternMatch: matches };
}

function weightFor(avgPriceForPattern) {
  // More historical sales value in this pattern → more weight.
  // Deliberately mild curve — this is a heuristic prior, not a valuation.
  if (!avgPriceForPattern) return 1;
  if (avgPriceForPattern >= 8000) return 3.5;
  if (avgPriceForPattern >= 4000) return 2.5;
  return 1.5;
}

/**
 * Scores a full list and returns only survivors above threshold, sorted desc.
 * @param {string[]} domains
 * @param {*} profile
 * @param {number} threshold  default 6.0 — tune based on how many survivors you want
 */
function scoreAndFilter(domains, profile, threshold = 6.0) {
  const scored = domains.map((d) => scoreDomain(d, profile));
  return scored
    .filter((s) => s.score >= threshold)
    .sort((a, b) => b.score - a.score);
}

module.exports = { scoreDomain, scoreAndFilter };
