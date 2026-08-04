// pages/api/verify-emails.js
//
// Three-level free lead check, in this exact order:
//
// Level 1 — Keyword check: does the email ADDRESS ITSELF (username or
//   domain) contain one of your niche/location keywords? Fast, free,
//   no network call.
// Level 2 — Internet check: only runs if Level 1 found nothing. Visits the
//   lead's own company website (if it's a business-domain email) and
//   checks the page content for your keywords.
// Level 3 — Deliverability check: does the domain actually have mail
//   servers configured (DNS MX lookup, via DNS-over-HTTPS — see
//   lib/emailCheck.js for why plain Node DNS wasn't reliable enough).
//
// Level 4 — Email score: percentage of the three checks that came back
//   positive. Keyword-relevant + business-confirmed + deliverable = 100%.

const { checkEmail } = require("../../lib/emailCheck");
const { checkRelevance } = require("../../lib/siteCheck");

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  const { emails, nicheKeywords = [], locationKeywords = [] } = req.body;

  if (!Array.isArray(emails)) {
    return res.status(400).json({ error: "emails must be an array" });
  }

  const allKeywords = [...nicheKeywords, ...locationKeywords]
    .map((k) => (k || "").toLowerCase().trim())
    .filter(Boolean);

  try {
    const results = [];

    for (const email of emails) {
      const emailCheck = await checkEmail(email);

      if (!emailCheck.validSyntax) {
        results.push({
          email,
          domain: null,
          keywordCheck: "Invalid email format",
          relevantBizCheck: "N/A",
          deliverabilityCheck: "N/A",
          emailScore: 0,
          emailsFoundOnSite: "",
        });
        continue;
      }

      const domain = emailCheck.domainPart;

      // Level 1: keyword check on the email address itself
      const emailLower = email.toLowerCase();
      const matchedKeywords = allKeywords.filter((k) => emailLower.includes(k));
      const keywordCheck = matchedKeywords.length > 0 ? "Relevant" : "Not Relevant";

      // Level 2: only runs if Level 1 found nothing to go on
      let relevantBizCheck;
      let emailsFoundOnSite = "";

      if (keywordCheck === "Relevant") {
        relevantBizCheck = "Skipped (Level 1 confirmed)";
      } else if (emailCheck.isFreeProvider) {
        // Free providers (gmail/yahoo/outlook) have no company site of
        // their own to check — flagged for your manual review rather than
        // guessed at, exactly as you asked. Never marked JUNK.
        relevantBizCheck = "N/A (free email, no company site)";
      } else {
        try {
          const site = await checkRelevance(domain, nicheKeywords, locationKeywords);
          if (!site.reachable) {
            relevantBizCheck = "Invalid (site unreachable)";
          } else if (site.nicheMatch || site.locationMatch) {
            relevantBizCheck = "Relevant";
          } else {
            relevantBizCheck = "Invalid";
          }
          emailsFoundOnSite = (site.siteEmails || []).filter((e) => e !== email).join(", ");
        } catch (e) {
          relevantBizCheck = "Invalid (check failed)";
        }
      }

      // Level 3: deliverability. "Unknown" (DNS lookup itself failed) is
      // deliberately kept distinct from "Not Deliverable" (a real negative
      // result) — an unknown shouldn't read as a confirmed dead address.
      const deliverabilityCheck =
        emailCheck.hasMx === true ? "Deliverable" : emailCheck.hasMx === false ? "Not Deliverable" : "Unknown";

      // Level 4: score
      const level1Pass = keywordCheck === "Relevant";
      const level2Pass = relevantBizCheck === "Relevant" || relevantBizCheck === "Skipped (Level 1 confirmed)";
      const level3Pass = deliverabilityCheck === "Deliverable";
      const emailScore = Math.round(((level1Pass ? 1 : 0) + (level2Pass ? 1 : 0) + (level3Pass ? 1 : 0)) / 3 * 100);

      results.push({
        email,
        domain,
        keywordCheck,
        relevantBizCheck,
        deliverabilityCheck,
        emailScore,
        emailsFoundOnSite,
      });
    }

    return res.status(200).json({ results });
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
