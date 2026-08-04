// lib/usCities.js
//
// Answers "does this domain name contain a real US city at all" — using a
// bundled, full US city -> state list (20,000+ cities, built from a public
// dataset, no external calls). Checking a domain against 20,000+ cities one
// at a time would be far too slow across a million-domain list, so this
// uses the Aho-Corasick algorithm: a standard, dependency-free way to
// search one string for thousands of patterns in a single pass, instead of
// one pass per pattern. Built once when the app starts, then reused for
// every domain checked.

const cityData = require("../data/us-cities.json");

class TrieNode {
  constructor() {
    this.children = new Map();
    this.fail = null;
    this.output = []; // city slugs that end exactly at this node
  }
}

function buildAutomaton(slugs) {
  const root = new TrieNode();

  for (const slug of slugs) {
    let node = root;
    for (const ch of slug) {
      if (!node.children.has(ch)) node.children.set(ch, new TrieNode());
      node = node.children.get(ch);
    }
    node.output.push(slug);
  }

  const queue = [];
  for (const child of root.children.values()) {
    child.fail = root;
    queue.push(child);
  }
  while (queue.length) {
    const current = queue.shift();
    for (const [ch, child] of current.children.entries()) {
      let failNode = current.fail;
      while (failNode && !failNode.children.has(ch)) failNode = failNode.fail;
      child.fail = failNode ? failNode.children.get(ch) : root;
      child.output = child.output.concat(child.fail.output);
      queue.push(child);
    }
  }

  return root;
}

const citySlugs = Object.keys(cityData);
const automatonRoot = buildAutomaton(citySlugs);

/**
 * Finds every known city slug that appears as a substring of `text`, in one
 * pass regardless of how many cities are in the reference list.
 * @param {string} text  lowercase domain root
 */
function findAllCityMatches(text) {
  let node = automatonRoot;
  const matches = new Set();

  for (const ch of text) {
    while (node !== automatonRoot && !node.children.has(ch)) node = node.fail;
    node = node.children.get(ch) || automatonRoot;
    for (const slug of node.output) matches.add(slug);
  }

  return [...matches];
}

/**
 * Returns the single best (longest) matched city, with its label and
 * possible states, or null if the text contains no recognized US city.
 */
function findBestCityMatch(text) {
  const matches = findAllCityMatches(text);
  if (matches.length === 0) return null;

  let bestSlug = matches[0];
  for (const m of matches) {
    if (m.length > bestSlug.length) bestSlug = m;
  }

  const entry = cityData[bestSlug];
  return { slug: bestSlug, label: entry.label, states: entry.states };
}

module.exports = { findAllCityMatches, findBestCityMatch, citySlugs };
