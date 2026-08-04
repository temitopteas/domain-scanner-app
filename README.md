# Domain Scanner, Email Verifier &amp; Geo Domain Scanner (100% free version)

Three tools, one app. No API keys, no subscriptions, no signups required.

1. **Domain Scanner** — upload a list of candidate domains + your friend's
   past sales data. The app pattern-matches against the sales data, checks
   which extensions (.com/.ai/.io/etc) are already registered, and checks
   whether close variants (e.g. QuickSmart.com / SmartQuick.com) already
   have a live, developed site. Produces a ranked shortlist based on real,
   free data — no AI judgment call, you read the facts and decide.
2. **Email Verifier** — give it your niche/location keywords and a list of
   leads. Runs a 3-level check in order, plus a score:
   - **Level 1 — keyword check**: does the email address itself (username or
     domain) contain one of your keywords?
   - **Level 2 — internet check**: only runs if Level 1 found nothing.
     Visits the lead's own company website and checks its content for your
     keywords. Free providers (gmail/yahoo/outlook) skip this — flagged for
     your manual review instead of guessed at.
   - **Level 3 — deliverability check**: does the domain actually have mail
     servers configured (DNS MX lookup, done via DNS-over-HTTPS for
     reliability — see the note below on why this matters).
   - **Email score**: percentage of the 3 checks that came back positive.
3. **Geo Domain Scanner** — checks every candidate domain against a bundled
   list of 20,000+ real US cities first (so you only see actual geo-domains,
   not random word matches), then cross-references your own spreadsheet of
   past geo-domain sales (domain, city/state, root keyword, price) to show
   your track record for that city and that root keyword — how many times
   you've sold each, and the average price — and live-checks whether a
   similar domain (city+keyword.com, keyword+city.com, state+keyword.com,
   etc.) is already developed.

## Why deliverability checks switched to DNS-over-HTTPS

Earlier versions used Node's built-in DNS lookup for the mail-server check.
On some networks (certain Windows setups, VPNs, corporate firewalls), that
lookup silently fails for *every* domain — including ones that obviously
have mail, like gmail.com — which made every single lead look like "no mail
server" regardless of anything else. The fix: mail-server checks now go
over plain HTTPS (the same way every other check in this app already
works), which is far more reliable across different networks. If that
somehow still fails, the result is reported as "Unknown," never silently
treated as a negative.

## Why no AI scoring step

The AI-scoring version of this costs a small amount per run (Claude API,
pay-as-you-go, no subscription) because it writes a plain-English reason
for each score. This free version skips that and just shows you the raw
checks — same underlying facts, you make the call yourself. If later you
want the written rationale, that's a small add-on, not a rebuild.

## How it stays free

| Task | How it's done for free |
|---|---|
| Is a domain registered? | [RDAP](https://rdap.org) — the modern, open, keyless replacement for WHOIS. Every registry supports it. |
| Is a variant domain already developed? | The app directly visits the URL and checks the page content for parking-page signals (GoDaddy/Sedo/"domain for sale" pages) vs. a real site. |
| Is an email deliverable? | Node's built-in DNS lookup checks if the domain has mail servers configured (MX record) — free, built into the server, no external service. |

None of these need you to sign up for anything or enter a credit card
anywhere.

## Setup (no technical background needed, just follow in order)

1. Install [Node.js](https://nodejs.org) (the free "LTS" version) if you
   don't have it.
2. Unzip this project.
3. Open a terminal in the project folder and run:
   ```bash
   npm install
   npm run dev
   ```
4. Open `http://localhost:3000` in your browser. That's it — no `.env`
   file, no keys.

## Deploying so it's online (optional)

When you're ready to use it from anywhere, not just your own computer:
1. Create a free account at [vercel.com](https://vercel.com).
2. Push this project to a GitHub repo (Vercel can walk you through this
   from their dashboard — you don't need to know git commands).
3. Import the repo in Vercel and click Deploy. No environment variables
   need to be set for this free version.

## Files

- `lib/patternScore.js` — scores candidate domains against your friend's
  past sales patterns (free, local, instant)
- `lib/salesData.js` — turns your friend's sales CSV into reusable pattern
  rules
- `lib/rdapCheck.js` — free domain registration check (RDAP)
- `lib/siteCheck.js` — free "is this domain actually developed" check +
  niche/location keyword relevance + on-page email extraction
- `lib/emailCheck.js` — free email format + mail-server check (DNS-over-HTTPS)
- `lib/geoSalesData.js` — turns your geo-domain sales CSV into city/root-
  keyword stats lookups
- `lib/usCities.js` — bundled full US city/state list + fast multi-city
  matching (Aho-Corasick)
- `lib/geoVariants.js` — generates and live-checks the 6 geo-domain naming
  patterns (city+root, root+city, root+city+root, state+root, root+state,
  root+state+root)
- `lib/geoMatch.js` — ties city recognition, your sales stats, and the
  similar-domain check together for one candidate
- `pages/api/scan-domains.js` — orchestrates the domain scan
- `pages/api/verify-emails.js` — orchestrates the 3-level email check
- `pages/api/scan-geo-domains.js` — orchestrates the geo domain match
- `pages/index.js` — the web page you interact with (upload files, see results)

## Honest limits of the free version

- The mail-server check tells you a domain *can* receive mail — it can't
  confirm one specific mailbox is active, the way a paid verifier can. It
  still catches dead/typo'd domains, which is most of what you're filtering
  for. If the lookup itself fails, it's reported as "Unknown," not treated
  as a negative.
- The Level 2 internet check is literal keyword matching on the lead's
  homepage text — not reading comprehension. A real carpet cleaner in
  Modesto whose site says "Central Valley" instead of "Modesto," or whose
  niche wording is on a different page than the homepage, can come back
  "Invalid" incorrectly. Treat that result as "worth a second look," not
  "discard."
- Whenever a lead's company site is checked, any email addresses found on
  that page (visible text or "mailto:" links) are pulled into an
  `emailsFoundOnSite` column — useful when the site lists a better or
  different contact than the one you scraped. A handful of obvious false
  positives (tracking-script artifacts, image filenames) are filtered out,
  but this isn't foolproof — sanity-check anything unfamiliar before using it.
- The Geo Domain Scanner's city check uses a real, full US city list
  (20,000+ cities, built from a public dataset), which unavoidably includes
  very small, obscure towns. Short town names can coincidentally match
  inside unrelated English words — e.g. "Rand, WV" matches inside
  "RandomBusiness.com", "Renova, MS" matches inside "Renovation.com". This
  is why every match has a `cityConfidence` — low confidence means a short
  city name matched with nothing else backing it up (no personal sales
  history there, no root keyword match). Treat low-confidence rows as
  "worth a second look," not proof of a real geo-domain.
- The second stage (your own city/root-keyword/price stats) only knows
  what's in your spreadsheet — a real geo-domain for a city or root keyword
  you haven't personally sold before will still show up (since it's
  genuinely a real city), just with 0 sales and no average price attached.
  That's expected, not a bug — it flags a possible new opportunity, not a
  proven one.
- The "similar domain in use" check is a live internet check (visits
  city+keyword.com, keyword+city.com, etc.), so the Geo Domain Scanner is
  no longer purely local/instant the way it first was — batches are capped
  and run in parallel the same way the Domain Scanner does, so a run will
  take some real time on a large list rather than finishing instantly.
- Leads on free email providers (gmail/yahoo/outlook) can't be relevance-
  checked this way — there's no company site tied to the address to fetch.
  They're flagged for manual review rather than guessed at.
- The site check can occasionally misjudge an unusual real site as
  "parked" or vice versa — spot-check anything borderline before you act
  on it.
- RDAP is a shared free public service, so on a very large run (hundreds
  of thousands of survivors) it will be slower than a paid bulk API. This
  matters less than it sounds, though, because stage 1's free pattern
  filter should already be cutting your list down by 95%+ before RDAP ever
  runs.
- No caching persists between separate runs (that would need a database).
  Within a single run, repeated lookups are cached in memory so you're not
  re-checking the same domain twice.
