import { useState } from "react";
import Papa from "papaparse";

const DOMAIN_BATCH_SIZE = 500; // domains sent to /api/scan-domains per request
const EMAIL_BATCH_SIZE = 25; // emails sent to /api/verify-emails per request (each does a live site fetch, so keep batches small)
const GEO_BATCH_SIZE = 20; // domains sent to /api/scan-geo-domains per request (now involves live "similar domain" checks, so kept small like the other tools)

export default function Home() {
  const [tab, setTab] = useState("domains");

  return (
    <div style={{ maxWidth: 900, margin: "40px auto", fontFamily: "sans-serif", padding: 16 }}>
      <h1>Domain Scanner &amp; Email Verifier</h1>
      <div style={{ marginBottom: 24 }}>
        <button onClick={() => setTab("domains")} disabled={tab === "domains"}>
          Domain Scanner
        </button>{" "}
        <button onClick={() => setTab("emails")} disabled={tab === "emails"}>
          Email Verifier
        </button>{" "}
        <button onClick={() => setTab("geo")} disabled={tab === "geo"}>
          Geo Domain Scanner
        </button>
      </div>
      {tab === "domains" && <DomainScanner />}
      {tab === "emails" && <EmailVerifier />}
      {tab === "geo" && <GeoDomainScanner />}
    </div>
  );
}


function DomainScanner() {
  const [domains, setDomains] = useState([]);
  const [salesData, setSalesData] = useState([]);
  const [salesFileError, setSalesFileError] = useState(null);
  const [threshold, setThreshold] = useState(6.0);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [results, setResults] = useState([]);
  const [error, setError] = useState(null);

  function handleDomainsFile(e) {
    const file = e.target.files[0];
    Papa.parse(file, {
      header: false,
      complete: (res) => setDomains(res.data.flat().filter(Boolean)),
    });
  }

  function handleSalesFile(e) {
    const file = e.target.files[0];
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const rows = res.data;
        if (rows.length === 0) {
          setSalesFileError("The file appears to be empty.");
          return;
        }

        // Match column names loosely — case/spacing/wording can vary a lot
        // between exports (e.g. "Domain" vs "domain", "Sale Price" vs "price").
        const headers = Object.keys(rows[0]);
        const domainKey = headers.find((h) => /domain|name|url/i.test(h));
        const priceKey = headers.find((h) => /price|amount|sale|value|\$/i.test(h));

        if (!domainKey || !priceKey) {
          setSalesFileError(
            `Couldn't find domain/price columns. Found these column names in your file: ${headers.join(", ")}. Rename your columns to "domain" and "price" and re-upload.`
          );
          return;
        }

        const parsed = rows
          .map((r) => ({
            domain: (r[domainKey] || "").toString().trim(),
            price: Number(String(r[priceKey]).replace(/[^0-9.]/g, "")),
          }))
          .filter((r) => r.domain && Number.isFinite(r.price) && r.price > 0);

        if (parsed.length === 0) {
          setSalesFileError(
            `Found columns "${domainKey}" and "${priceKey}" but couldn't read any valid rows from them. Check that price values are plain numbers.`
          );
          return;
        }

        setSalesFileError(null);
        setSalesData(parsed);
      },
    });
  }

  async function run() {
    setRunning(true);
    setError(null);
    setResults([]);
    const batches = chunk(domains, DOMAIN_BATCH_SIZE);
    setProgress({ done: 0, total: batches.length });

    let allResults = [];
    for (const batch of batches) {
      try {
        const res = await fetch("/api/scan-domains", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ domains: batch, salesData, threshold }),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        allResults = [...allResults, ...data.results];
        setResults([...allResults]);
      } catch (e) {
        setError(e.message);
        break;
      }
      setProgress((p) => ({ ...p, done: p.done + 1 }));
    }
    setRunning(false);
  }

  return (
    <div>
      <h2>1. Upload your friend's past sales (CSV: domain,price)</h2>
      <input type="file" accept=".csv" onChange={handleSalesFile} />
      <p>{salesData.length} sales loaded</p>
      {salesFileError && <p style={{ color: "red", fontSize: 13 }}>{salesFileError}</p>}

      <h2>2. Upload candidate domain list (CSV, one domain per row)</h2>
      <input type="file" accept=".csv" onChange={handleDomainsFile} />
      <p>{domains.length} domains loaded</p>

      <h2>3. Stage-1 score threshold</h2>
      <input
        type="number"
        step="0.5"
        value={threshold}
        onChange={(e) => setThreshold(Number(e.target.value))}
      />
      <p style={{ fontSize: 12, color: "#666" }}>
        Higher = fewer, higher-confidence candidates get checked in the free
        registration/site-check stage. Start high (7-8) on a 1M-row list.
      </p>

      <button
        onClick={run}
        disabled={running || domains.length === 0 || salesData.length === 0}
      >
        {running ? `Processing batch ${progress.done}/${progress.total}...` : "Run scan"}
      </button>

      {running && (
        <p style={{ fontSize: 12, color: "#666" }}>
          Each batch checks domain registrations and live websites over the
          internet, so a batch can take anywhere from a few seconds to a
          minute or so — this is normal, not frozen. Results appear below as
          each batch finishes, so you'll start seeing rows before the whole
          list is done.
        </p>
      )}

      {error && <p style={{ color: "red" }}>{error}</p>}

      <ResultsTable
        results={results}
        columns={[
          "domain",
          "score",
          "patternMatch",
          "extensionCount",
          "takenExtensions",
          "anyVariantDeveloped",
          "developedVariants",
        ]}
      />
    </div>
  );
}

function EmailVerifier() {
  const [emails, setEmails] = useState([]);
  const [sellingDomain, setSellingDomain] = useState("");
  const [nicheKeywords, setNicheKeywords] = useState("");
  const [locationKeywords, setLocationKeywords] = useState("");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [results, setResults] = useState([]);
  const [error, setError] = useState(null);

  function handleFile(e) {
    const file = e.target.files[0];
    Papa.parse(file, {
      header: false,
      complete: (res) => setEmails(res.data.flat().filter(Boolean)),
    });
  }

  async function run() {
    setRunning(true);
    setError(null);
    setResults([]);
    const batches = chunk(emails, EMAIL_BATCH_SIZE);
    setProgress({ done: 0, total: batches.length });

    let allResults = [];
    for (const batch of batches) {
      try {
        const res = await fetch("/api/verify-emails", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            emails: batch,
            nicheKeywords: nicheKeywords.split(",").map((s) => s.trim()).filter(Boolean),
            locationKeywords: locationKeywords.split(",").map((s) => s.trim()).filter(Boolean),
          }),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        allResults = [...allResults, ...data.results];
        setResults([...allResults]);
      } catch (e) {
        setError(e.message);
        break;
      }
      setProgress((p) => ({ ...p, done: p.done + 1 }));
    }
    setRunning(false);
  }

  return (
    <div>
      <h2>1. Domain you're selling</h2>
      <input
        value={sellingDomain}
        onChange={(e) => setSellingDomain(e.target.value)}
        placeholder="ModestoRugCleaning.com"
        style={{ width: "100%" }}
      />
      <p style={{ fontSize: 12, color: "#666" }}>
        Just for your reference in this session — used in labeling, not sent anywhere.
      </p>

      <h2>2. Niche keywords (comma-separated)</h2>
      <input
        value={nicheKeywords}
        onChange={(e) => setNicheKeywords(e.target.value)}
        placeholder="carpet, rug, cleaning"
        style={{ width: "100%" }}
      />

      <h2>3. Location keywords (comma-separated)</h2>
      <input
        value={locationKeywords}
        onChange={(e) => setLocationKeywords(e.target.value)}
        placeholder="Modesto"
        style={{ width: "100%" }}
      />
      <p style={{ fontSize: 12, color: "#666" }}>
        Runs 3 checks in order, then a score: <b>Level 1</b> — does the
        email address itself contain one of these keywords? <b>Level 2</b> —
        only if Level 1 found nothing, visits the lead's own company
        website and checks its content for these keywords. <b>Level 3</b> —
        can the domain actually receive mail (deliverability)? Free
        providers (gmail/yahoo/outlook) skip Level 2 — flagged for your
        manual review rather than guessed at. <b>Email score</b> is the
        percentage of the 3 checks that came back positive.
      </p>

      <h2>4. Upload leads (CSV, one email per row)</h2>
      <input type="file" accept=".csv" onChange={handleFile} />
      <p>{emails.length} leads loaded</p>

      <button
        onClick={run}
        disabled={running || emails.length === 0 || (!nicheKeywords && !locationKeywords)}
      >
        {running ? `Processing batch ${progress.done}/${progress.total}...` : "Run verification"}
      </button>

      {error && <p style={{ color: "red" }}>{error}</p>}

      <ResultsTable
        results={results}
        columns={["email", "domain", "keywordCheck", "relevantBizCheck", "deliverabilityCheck", "emailScore", "emailsFoundOnSite"]}
      />
    </div>
  );
}

function GeoDomainScanner() {
  const [geoSales, setGeoSales] = useState([]);
  const [geoSalesError, setGeoSalesError] = useState(null);
  const [domains, setDomains] = useState([]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [results, setResults] = useState([]);
  const [error, setError] = useState(null);

  function handleGeoSalesFile(e) {
    const file = e.target.files[0];
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const rows = res.data;
        if (rows.length === 0) {
          setGeoSalesError("The file appears to be empty.");
          return;
        }

        const headers = Object.keys(rows[0]);
        const cityKey = headers.find((h) => /city|state|location|geo/i.test(h));
        const rootKey = headers.find((h) => /root|categor|niche|industry|type|keyword/i.test(h));
        const priceKey = headers.find((h) => /price|amount|sale|value|\$/i.test(h));

        if (!cityKey || !rootKey || !priceKey) {
          setGeoSalesError(
            `Couldn't find city/root keyword/price columns. Found these column names: ${headers.join(", ")}. Rename your columns to include "city", "root keyword", and "price" and re-upload.`
          );
          return;
        }

        const parsed = rows
          .map((r) => ({
            cityState: (r[cityKey] || "").toString().trim(),
            root: (r[rootKey] || "").toString().trim(),
            price: Number(String(r[priceKey]).replace(/[^0-9.]/g, "")),
          }))
          .filter((r) => r.cityState && r.root);

        if (parsed.length === 0) {
          setGeoSalesError(`Found the columns but couldn't read any valid rows from them.`);
          return;
        }

        setGeoSalesError(null);
        setGeoSales(parsed);
      },
    });
  }

  function handleDomainsFile(e) {
    const file = e.target.files[0];
    Papa.parse(file, {
      header: false,
      complete: (res) => setDomains(res.data.flat().filter(Boolean)),
    });
  }

  async function run() {
    setRunning(true);
    setError(null);
    setResults([]);
    const batches = chunk(domains, GEO_BATCH_SIZE);
    setProgress({ done: 0, total: batches.length });

    let allResults = [];
    for (const batch of batches) {
      try {
        const res = await fetch("/api/scan-geo-domains", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ domains: batch, geoSales }),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        allResults = [...allResults, ...data.results];
      } catch (e) {
        setError(e.message);
        break;
      }
      setProgress((p) => ({ ...p, done: p.done + 1 }));
    }

    // Final sort across all batches combined, same rule the API applies per-batch
    allResults.sort((a, b) => {
      if (a.cityConfidence !== b.cityConfidence) return a.cityConfidence === "high" ? -1 : 1;
      return (b.comboSalesCount || b.citySalesCount || 0) - (a.comboSalesCount || a.citySalesCount || 0);
    });
    setResults(allResults);
    setRunning(false);
  }

  return (
    <div>
      <h2>1. Upload your own past sales (CSV: domain, city/state, root keyword, price)</h2>
      <input type="file" accept=".csv" onChange={handleGeoSalesFile} />
      <p>{geoSales.length} sales loaded</p>
      {geoSalesError && <p style={{ color: "red", fontSize: 13 }}>{geoSalesError}</p>}
      <p style={{ fontSize: 12, color: "#666" }}>
        Every candidate is first checked against a bundled list of all US
        cities — only real city names make it through. Your own sales sheet
        is then used to show your track record for that city and for the
        matched root keyword. Use "City, ST" format (comma before the
        state) for the most reliable matching. Multi-word cities ("Los
        Angeles") are matched as one squished word ("losangeles").
      </p>

      <h2>2. Upload expired/candidate domain list (CSV, one domain per row)</h2>
      <input type="file" accept=".csv" onChange={handleDomainsFile} />
      <p>{domains.length} domains loaded</p>

      <button onClick={run} disabled={running || domains.length === 0 || geoSales.length === 0}>
        {running ? `Processing batch ${progress.done}/${progress.total}...` : "Run geo scan"}
      </button>

      {running && (
        <p style={{ fontSize: 12, color: "#666" }}>
          Each match also live-checks whether a similar domain (e.g.
          city+keyword.com, keyword+city.com) is already developed, so this
          takes longer than a purely local scan — normal, not frozen.
        </p>
      )}

      {error && <p style={{ color: "red" }}>{error}</p>}

      <p style={{ fontSize: 12, color: "#666", marginTop: 12 }}>
        Every domain shown here contains a real US city name — checked
        first against a bundled list of 20,000+ cities. <b>cityConfidence:
        low</b> means the matched city name is short and has nothing else
        backing it up (no sales history, no root keyword match) — it may
        just be a coincidental match inside an unrelated word (e.g. "Rand,
        WV" inside "RandomBusiness.com"). Treat those with extra
        skepticism. <b>similarDomainsInUse</b> lists any of the
        city+keyword/keyword+city/etc. variants that are already live.
      </p>

      <ResultsTable
        results={results}
        columns={[
          "domain",
          "domainCity",
          "citySalesCount",
          "domainRootWord",
          "rootSalesCount",
          "rootAvgPrice",
          "comboSalesCount",
          "comboAvgPrice",
          "cityConfidence",
          "similarDomainsInUse",
        ]}
      />
    </div>
  );
}

function ResultsTable({ results, columns }) {
  if (results.length === 0) return null;

  function downloadCsv() {
    const escapeCell = (val) => {
      const str = Array.isArray(val) ? val.join("; ") : String(val ?? "");
      // Quote any cell containing a comma, quote, or newline, per CSV rules
      return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
    };

    const header = columns.join(",");
    const rows = results.map((r) => columns.map((c) => escapeCell(r[c])).join(","));
    const csvContent = [header, ...rows].join("\n");

    // Adding a BOM so Excel opens UTF-8 CSVs without mangling special characters
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `results-${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div style={{ marginTop: 24 }}>
      <p>
        {results.length} results{" "}
        <button onClick={downloadCsv} style={{ marginLeft: 8 }}>
          Download as CSV (opens in Excel)
        </button>
      </p>
      <table border="1" cellPadding="6" style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {results.map((r, i) => (
            <tr key={i}>
              {columns.map((c) => (
                <td key={c}>{Array.isArray(r[c]) ? r[c].join(", ") : String(r[c] ?? "")}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
