// Local smoke test of the board: serves board/ with a stub of the claude.ai runtime that is filled from seed/,
// then renders it in light and dark at three widths, opens an opportunity, saves a change and checks the viewer mode.
// Run from the repository root:  node tests/preview.mjs [output directory for screenshots]
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

// Playwright is installed globally in the cloud environment; require() finds it there, a bare ESM import does not.
const { chromium } = createRequire(import.meta.url)("playwright");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = process.argv[2] || path.join(root, "tests", "out");
fs.mkdirSync(outDir, { recursive: true });

function seed() {
  const docs = {};
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      if (fs.statSync(full).isDirectory()) walk(full);
      else if (name.endsWith(".json")) docs[path.relative(path.join(root, "seed"), full).replace(/\\/g, "/").replace(/\.json$/, "")] = JSON.parse(fs.readFileSync(full, "utf8"));
    }
  };
  walk(path.join(root, "seed"));
  return docs;
}

// the stub: an in-memory database with the calls the board uses, and a user with a chosen write level
const STUB = `
(function () {
  var params = new URLSearchParams(location.search);
  var docs = params.get("empty") ? {} : window.__SEED__;
  var subs = [];
  function snapDoc(p) { var d = docs[p]; return { id: p.split("/").pop(), exists: !!d, data: function () { return d; }, metadata: { fromCache: false } }; }
  function snapCol(c) {
    var list = Object.keys(docs).filter(function (p) { return p.indexOf(c + "/") === 0 && p.split("/").length === c.split("/").length + 1; }).sort().map(snapDoc);
    return { docs: list, size: list.length, empty: !list.length, metadata: { fromCache: false } };
  }
  function fire() { subs.forEach(function (s) { s(); }); }
  var canWrite = params.get("role") !== "view";
  var db = {
    doc: function (p) { return {
      onSnapshot: function (next) { var f = function () { next(snapDoc(p)); }; subs.push(f); setTimeout(f, 0); return function () {}; },
      set: function (data) { if (!canWrite) return Promise.reject({ code: "invalid_argument" }); docs[p] = data; window.__WRITES__.push({ op: "set", path: p, data: data }); setTimeout(fire, 0); return Promise.resolve(); },
      delete: function () { delete docs[p]; window.__WRITES__.push({ op: "delete", path: p }); setTimeout(fire, 0); return Promise.resolve(); }
    }; },
    collection: function (c) { return { onSnapshot: function (next) { var f = function () { next(snapCol(c)); }; subs.push(f); setTimeout(f, 0); return function () {}; } }; }
  };
  var user = { can: function () { return Promise.resolve(canWrite); }, id: function () { return Promise.resolve("u_test"); } };
  window.__WRITES__ = [];
  window.claude = { use: function (name) { return Promise.resolve(name === "db" ? db : name === "user" ? user : null); } };
})();`;

const TYPES = { ".css": "text/css", ".js": "text/javascript", ".html": "text/html" };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/") {
    const page = fs.readFileSync(path.join(root, "board", "index.html"), "utf8")
      .replace('<script src="board.js"></script>', `<script>window.__SEED__ = ${JSON.stringify(seed()).replace(/</g, "\\u003c")};${STUB}</script><script src="board.js"></script>`);
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(`<!doctype html><html><head><meta charset="utf8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light}body{margin:0}[hidden]{display:none!important}</style></head><body>${page}</body></html>`);
    return;
  }
  const file = path.join(root, "board", path.normalize(url.pathname));
  if (!file.startsWith(path.join(root, "board")) || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" });
  res.end(fs.readFileSync(file));
});
await new Promise((r) => server.listen(0, r));
const base = `http://localhost:${server.address().port}/`;

const problems = [];
const check = (ok, text) => { console.log((ok ? "ok   " : "FAIL ") + text); if (!ok) problems.push(text); };
const browser = await chromium.launch();

async function open(width, height, scheme, query = "") {
  const context = await browser.newContext({ viewport: { width, height }, colorScheme: scheme, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on("console", (m) => { if (m.type() === "error" && !/fonts\.g|ERR_|Failed to load resource/.test(m.text())) problems.push(`console: ${m.text()}`); });
  page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
  await page.goto(base + query);
  await page.waitForFunction(() => !document.getElementById("stamp").textContent.includes("Loading"));
  return page;
}
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

for (const [w, h] of [[1920, 1080], [1280, 800], [390, 844]]) {
  for (const scheme of ["light", "dark"]) {
    const page = await open(w, h, scheme);
    check((await overflow(page)) <= 0, `${w}px ${scheme}: no sideways scroll`);
    await page.screenshot({ path: path.join(outDir, `board-${w}-${scheme}.png`), fullPage: true });
    await page.locator("#row-opp-0001").click();
    await page.waitForSelector("#panel-title");
    check((await overflow(page)) <= 0, `${w}px ${scheme}: no sideways scroll with the panel open`);
    await page.screenshot({ path: path.join(outDir, `panel-${w}-${scheme}.png`), fullPage: w >= 1400 });
    await page.context().close();
  }
}

{ // team page
  const page = await open(1920, 1080, "light", "#team");
  await page.waitForSelector(".team-card");
  check((await page.locator(".team-card").count()) === 6, "team page shows the group and five regions");
  check((await page.locator("#team .kpi-value").allTextContents()).slice(0, 2).join("|") === "12|5", "team KPIs: 12 open, 5 need an owner");
  const amuPm = await page.locator("#team .dash-table").first().locator("tr", { hasText: "AMU" }).filter({ hasText: "Project Manager" }).textContent();
  check(/Nobody in this role/.test(amuPm) && /1$/.test(amuPm.trim()), "workload table shows AMU without a Project Manager and one unfilled opportunity");
  check(/United Kingdom/.test(await page.locator("#team .dash-table").nth(1).textContent()), "demand by country lists the United Kingdom");
  check((await overflow(page)) <= 0, "team page: no sideways scroll at 1920px");
  await page.screenshot({ path: path.join(outDir, "team-1920-light.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  check((await overflow(page)) <= 0, "team page: no sideways scroll at 390px");
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.locator("#team-florian-achterberg").click();
  await page.waitForSelector(".opp-btn");
  check((await page.locator(".opp-btn").count()) === 3 && (await page.evaluate(() => location.hash)) === "#opportunities", "a person's count opens their 3 open opportunities");
  await page.context().close();
}

{ // analysis page
  const page = await open(1920, 1080, "light", "#analysis");
  await page.waitForSelector("#analysis .kpi");
  const kpis = (await page.locator("#analysis .kpi").allTextContents()).join(" | ");
  check(/86 %Bid rate12 bid · 2 no bid/.test(kpis), "bid rate: 12 bid, 2 no bid, 86 %");
  check(/71 %Win rate5 won · 2 lost/.test(kpis), "win rate: 5 won, 2 lost, 71 %");
  check((await page.locator("#analysis .dash-table").last().locator("tbody tr").count()) === 5, "five opportunities closed without a win");
  check((await overflow(page)) <= 0, "analysis page: no sideways scroll at 1920px");
  await page.screenshot({ path: path.join(outDir, "analysis-1920-light.png"), fullPage: true });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.screenshot({ path: path.join(outDir, "analysis-1920-dark.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  check((await overflow(page)) <= 0, "analysis page: no sideways scroll at 390px");
  await page.context().close();
}

{ // grouping of the seed and the stamp
  const page = await open(1600, 900, "light");
  check((await page.locator(".opp-btn").count()) === 12, "open filter shows the 12 open opportunities");
  check((await page.locator(".board-section .section-title").allTextContents()).join("|") === "Needs an owner|Pre-sales|Delivery|Finance", "sections follow owner need and the three phases");
  check(/12 open · 5 need an owner/.test(await page.locator("#stamp").textContent()), "stamp counts open and unowned opportunities");
  await page.locator('#f-show [data-value="all"]').click();
  check((await page.locator(".opp-btn").count()) === 18, "all filter shows 18 opportunities");
  await page.locator("#f-service").selectOption("amu");
  check((await page.locator(".opp-btn").count()) === 6, "service region AMU shows 6 opportunities");
  await page.locator("#f-service").selectOption("");
  await page.locator("#f-stage").selectOption("3.3");
  check((await page.locator(".opp-btn").count()) === 3, "stage 3.3 shows 3 opportunities");
  await page.locator("#f-stage").selectOption("");
  await page.locator("#f-search").fill("VC-104512");
  await page.waitForTimeout(300);
  check((await page.locator(".opp-btn").count()) === 1, "search by IFS reference finds one opportunity");
  await page.locator("#f-search").fill("");
  await page.waitForTimeout(300);

  // assign and save
  await page.locator("#row-opp-0001").click();
  check(await page.evaluate(() => document.activeElement.id === "panel-title"), "opening a row moves focus to the panel title");
  await page.locator("#p-apply").click();
  check((await page.locator("#p-sa").inputValue()) === "jun-wei-ong" && (await page.locator("#p-salespm").inputValue()) === "helen-ashdown", "suggestion fills the empty Sales PM and SA fields");
  await page.locator("#p-stage").selectOption("2");
  await page.locator("#p-tcv").fill("52000");
  await page.locator("#p-save").click();
  await page.waitForFunction(() => /Saved at/.test(document.querySelector("#panel .panel-msg.save").textContent));
  const writes = await page.evaluate(() => window.__WRITES__);
  check(writes.length === 1 && writes[0].path === "assign/opp-0001" && writes[0].data.sa === "jun-wei-ong" && writes[0].data.stage === "2" && writes[0].data.tcv === 52000, "save writes one assign document and nothing else");
  check((await page.locator("#row-opp-0001 .opp-v").first().textContent()) === "Helen Ashdown", "the row shows the new Sales PM");
  await page.keyboard.press("Escape");
  check(await page.evaluate(() => document.activeElement.id === "row-opp-0001" && document.getElementById("panel").hidden), "Escape closes the panel and returns focus to the row");

  // fast lane: no Solution Architect needed
  check(/Not needed/.test(await page.locator("#row-opp-0012").textContent()) && /Fast lane/.test(await page.locator("#row-opp-0012").textContent()), "a fast-lane row needs no Solution Architect");

  // close as no bid with a reason
  await page.locator("#row-opp-0003").click();
  await page.locator("#p-outcome").selectOption("no-bid");
  await page.locator("#p-reason").fill("No local partner");
  await page.locator("#p-save").click();
  await page.waitForFunction(() => /Saved at/.test(document.querySelector("#panel .panel-msg.save").textContent));
  const wc = await page.evaluate(() => window.__WRITES__);
  const last = wc[wc.length - 1];
  check(last.path === "assign/opp-0003" && last.data.outcome === "no-bid" && last.data.closeReason === "No local partner" && /^\d{4}-\d{2}-\d{2}$/.test(last.data.closedAt), "closing writes outcome, reason and date");
  await page.keyboard.press("Escape");
  check(/^No bid/.test(await page.locator("#row-opp-0003").textContent()), "the closed opportunity shows its outcome");
  await page.locator('#f-show [data-value="open"]').click();
  check((await page.locator("#row-opp-0003").count()) === 0, "a closed opportunity leaves the open list");
  await page.locator('#f-show [data-value="all"]').click();

  // grouping note
  await page.locator("#row-opp-0008").click();
  await page.locator("#p-fix").fill("The licence question is a separate request.");
  await page.locator("#p-correct").click();
  await page.waitForSelector("#p-withdraw");
  const w2 = await page.evaluate(() => window.__WRITES__);
  check(w2[w2.length - 1].path === "corrections/opp-0008", "a grouping note is written to corrections");
  await page.context().close();
}

{ // viewer: no inputs
  const page = await open(1600, 900, "light", "?role=view");
  await page.locator("#row-opp-0006").click();
  await page.waitForSelector("#panel-title");
  check((await page.locator("#panel input, #panel select, #panel textarea, #p-save").count()) === 0, "a viewer gets no input fields in the panel");
  check(/Florian Achterberg/.test(await page.locator("#panel .panel-dl").textContent()), "a viewer reads the assignment");
  await page.context().close();
}

{ // empty database
  const page = await open(1280, 800, "light", "?empty=1");
  check(/No opportunities yet/.test(await page.locator("#lists").textContent()), "an empty database shows the empty state");
  await page.screenshot({ path: path.join(outDir, "empty-1280-light.png") });
  await page.context().close();
}

await browser.close();
server.close();
if (problems.length) { console.log("\n" + problems.length + " problem(s):\n" + problems.join("\n")); process.exit(1); }
console.log("\nall checks passed; screenshots in " + outDir);
