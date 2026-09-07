// lib/salesData.js
//
// Turns a raw list of past sales (domain + price) into a set of reusable
// "pattern features" that lib/patternScore.js can check candidates against.
// This is the closest thing to "learning your friend's strategy" we can do
// honestly from a few dozen examples — it's pattern extraction, not a
// trained model. Treat the output as heuristics, not predictions.

const TECH_AFFIXES = [
  "ai", "hq", "pay", "flow", "os", "app", "labs", "ly", "fy", "io",
  "get", "yuno", "hey", "epiq",
];

const VOWELS = new Set(["a", "e", "i", "o", "u"]);

/**
 * @param {Array<{domain: string, price: number}>} sales
 *   e.g. [{ domain: "Veryfyd.com", price: 4988 }, ...]
 */
function buildPatternProfile(sales) {
  const roots = sales.map((s) => rootOf(s.domain));

  const lengths = roots.map((r) => r.length);
  const avgLength = avg(lengths);

  const vowelStripRate = rate(roots, looksLikeVowelStrip);
  const techAffixRate = rate(roots, hasTechAffix);
  const compoundWordRate = rate(roots, looksLikeCompoundWord);

  const priceByPattern = {
    vowelStrip: avg(sales.filter((s) => looksLikeVowelStrip(rootOf(s.domain))).map((s) => s.price)),
    techAffix: avg(sales.filter((s) => hasTechAffix(rootOf(s.domain))).map((s) => s.price)),
    compound: avg(sales.filter((s) => looksLikeCompoundWord(rootOf(s.domain))).map((s) => s.price)),
  };

  return {
    sampleSize: sales.length,
    avgLength,
    vowelStripRate,
    techAffixRate,
    compoundWordRate,
    priceByPattern,
  };
}

function rootOf(domain) {
  return domain.toLowerCase().replace(/\.(com|ai|io|co|app|net|us|dev)$/i, "");
}

function looksLikeVowelStrip(root) {
  // Heuristic: a real dictionary-ish word with 1-2 vowels removed
  // e.g. "veryfyd" (verified), "shrlock" (sherlock), "compnd" (compound)
  const vowelCount = [...root].filter((c) => VOWELS.has(c)).length;
  const consonantRun = longestConsonantRun(root);
  return vowelCount <= 2 && consonantRun >= 3 && root.length >= 5;
}

function longestConsonantRun(str) {
  let max = 0;
  let cur = 0;
  for (const c of str) {
    if (!VOWELS.has(c) && /[a-z]/.test(c)) {
      cur += 1;
      max = Math.max(max, cur);
    } else {
      cur = 0;
    }
  }
  return max;
}

function hasTechAffix(root) {
  return TECH_AFFIXES.some(
    (a) => root.startsWith(a) || root.endsWith(a)
  );
}

function looksLikeCompoundWord(root) {
  // crude: two capitalizable chunks glued together, judged by syllable-ish
  // heuristics rather than a dictionary (kept dependency-free on purpose)
  return root.length >= 8 && root.length <= 14 && !hasTechAffix(root);
}

function rate(arr, fn) {
  if (arr.length === 0) return 0;
  return arr.filter(fn).length / arr.length;
}

function avg(arr) {
  const nums = arr.filter((n) => Number.isFinite(n));
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

module.exports = {
  buildPatternProfile,
  rootOf,
  looksLikeVowelStrip,
  hasTechAffix,
  looksLikeCompoundWord,
};
