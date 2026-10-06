import { chromium } from "playwright";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { pickFixture, pickClientFixture, TAVILY_BADR, toStreamEvents, sse } from "./fixtures.mjs";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(TEST_DIR, "..");
const TESTEXT = path.join(os.tmpdir(), "sanad-test-ext");
fs.rmSync(TESTEXT, { recursive: true, force: true });
const SKIP = new Set(["test", "node_modules", "package.json", "package-lock.json"]);   // dev-only files
fs.cpSync(ROOT, TESTEXT, { recursive: true, filter: (p) => !SKIP.has(path.relative(ROOT, p).split(path.sep)[0]) });
const mf = JSON.parse(fs.readFileSync(TESTEXT + "/manifest.json"));
mf.host_permissions.push("http://localhost:8787/*");   // test-only
fs.writeFileSync(TESTEXT + "/manifest.json", JSON.stringify(mf, null, 2));
const bg = fs.readFileSync(TESTEXT + "/background.js", "utf8");
if (!bg.includes("IDLE_TIMEOUT_MS = 60_000")) throw new Error("idle limit not found in background.js");
fs.writeFileSync(TESTEXT + "/background.js", bg.replace("IDLE_TIMEOUT_MS = 60_000", "IDLE_TIMEOUT_MS = 1_500"));   // test-only

const calls = [];
const searchCalls = [];
const api = http.createServer((req, res) => {
  const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "POST, OPTIONS" };
  if (req.method === "OPTIONS") { res.writeHead(204, cors); return res.end(); }
  let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => {
    const body = JSON.parse(b);
    let out;
    if (req.url === "/search") { searchCalls.push({ headers: req.headers, body }); out = TAVILY_BADR; }   // mock Tavily
    else {
      calls.push({ headers: req.headers, body });
      out = body.tools?.[0]?.input_schema ? pickClientFixture(body) : pickFixture(body);   // client-search provider
    }
    if (body.stream && req.url !== "/search") {   // stream the reply in small pieces, like the real API
      const asked = JSON.stringify(body.messages[0].content).toLowerCase();
      const events = toStreamEvents(out, asked.includes("slow") ? 400 : 24);
      res.writeHead(200, { ...cors, "content-type": "text/event-stream" });
      if (asked.includes("stall")) return res.write(sse(events[0]));   // starts, then goes silent
      const gap = asked.includes("slow") ? 700 : 25;   // "slow": longer in total than the idle limit, never silent that long
      const next = () => events.length ? (res.write(sse(events.shift())), setTimeout(next, gap)) : res.end();
      return setTimeout(next, 300);
    }
    setTimeout(() => { res.writeHead(200, { ...cors, "content-type": "application/json" }); res.end(JSON.stringify(out)); }, 300);
  });
}).listen(8787);

const page = `<!doctype html><html><head><meta charset="utf-8"><title>Test article</title>
<style>body{font-family:Georgia,serif;max-width:720px;margin:40px auto;font-size:18px;line-height:1.6;color:#222}</style></head><body>
<h1>Lessons from the Prophet's life</h1>
<p id="p1">Many people know that the Battle of Badr took place in the fifth year after the Hijra, when the Muslims faced the Quraysh.</p>
<p id="p2">As the famous hadith says: "Seek knowledge even if you have to go to China."</p>
<p id="p3">The Hijra teaches that every great change starts with one brave step.</p>
</body></html>`;
const web = http.createServer((q, r) => { r.writeHead(200, { "content-type": "text/html; charset=utf-8" }); r.end(page); }).listen(8788);

const ctx = await chromium.launchPersistentContext("", {
  headless: false,
  args: ["--headless=new", `--disable-extensions-except=${TESTEXT}`, `--load-extension=${TESTEXT}`, "--no-sandbox"],
  viewport: { width: 1360, height: 860 },
});
let sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent("serviceworker");
const results = [];
const ok = (name, cond) => { results.push([name, !!cond]); console.log(cond ? "✓" : "✗", name); };

// 1) no key → helpful error
const p = ctx.pages()[0] || await ctx.newPage();
for (const extra of ctx.pages()) if (extra !== p && extra.url().startsWith("chrome-extension://")) await extra.close();
await p.goto("http://localhost:8788/");
async function selectAndVerify(id) {
  await p.evaluate((id) => {
    const el = document.getElementById(id); const r = document.createRange(); r.selectNodeContents(el);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    const b = el.getBoundingClientRect();
    el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, clientX: b.left + 5, clientY: b.top + 5 }));
  }, id);
  await p.locator("#sanad-root .fab").waitFor({ state: "visible", timeout: 3000 });
  await p.locator("#sanad-root .fab").click();
}
await selectAndVerify("p1");
await p.locator("#sanad-root .err").waitFor({ timeout: 5000 });
ok("no API key → shows settings prompt", (await p.locator("#sanad-root .err").innerText()).includes("API key"));

// 2) configure via storage
await sw.evaluate(() => chrome.storage.local.set({ apiKey: "test-key", apiBase: "http://localhost:8787", model: "mock-model" }));
await p.locator("#sanad-root .new").click();

// The mock streams fast and the final card replaces the live parts, so polling could miss them:
// record every live search and draft the panel shows, and check the record afterwards.
await p.evaluate(() => {
  const root = document.getElementById("sanad-root").shadowRoot;
  new MutationObserver(() => {
    for (const el of root.querySelectorAll(".live .hit, .card.draft")) window.__live.push(`${el.className}: ${el.innerText}`);
  }).observe(root, { childList: true, subtree: true, characterData: true });
});
const watchLive = () => p.evaluate(() => { window.__live = []; });
const sawLive = (kind, pattern) => p.evaluate(([k, src]) => window.__live.some((x) => x.startsWith(k) && new RegExp(src).test(x)), [kind, pattern]);

// 3) seerah claim
await watchLive();
await selectAndVerify("p1");
await p.locator("#sanad-root .card.draft .headline").waitFor({ timeout: 8000 }).catch(() => {});
await p.screenshot({ path: TEST_DIR + "/shot-0-live.png" });
await p.locator("#sanad-root .card:not(.draft)").first().waitFor({ timeout: 8000 });
ok("live: search and its pages shown while checking", await sawLive("hit", "dorar\\.net"));
ok("live: draft answer shown before the audit", await sawLive("card draft", "still checking"));
ok("live: final card replaces the draft", await p.locator("#sanad-root .card.draft").count() === 0 && await p.locator("#sanad-root .live").count() === 0);
let card = await p.locator("#sanad-root .card:not(.draft)").last().innerText();
ok("Badr claim → 'Contradicts the sources'", card.includes("Contradicts the sources"));
ok("shows correction", card.includes("Ramadan, 2 AH"));
ok("source marked verified", card.includes("verified link"));
ok("Arabic excerpt shown", card.includes("غزوة بدر"));
await p.screenshot({ path: TEST_DIR + "/shot-1-seerah.png" });

// request checks
const c0 = calls.at(-1);
ok("sends anthropic headers", c0.headers["x-api-key"] === "test-key" && c0.headers["anthropic-version"] === "2023-06-01");
ok("asks for a streamed reply", c0.body.stream === true);
ok("search restricted to approved domains", JSON.stringify(c0.body.tools[0].allowed_domains) === JSON.stringify(["dorar.net","shamela.ws","quranpedia.net","islamic-content.com","dawa.center"]));

// 4) follow-up chat
await p.locator("#sanad-root textarea").fill("How many Muslims fought at Badr?");
await p.locator("#sanad-root form button").click();
await p.locator("#sanad-root .bubble.bot:not(.draft)").last().filter({ hasText: "three hundred" }).waitFor({ timeout: 8000 });
const fu = await p.locator("#sanad-root .bubble.bot:not(.draft)").last().innerText();
ok("follow-up answered with source link", fu.includes("three hundred") && fu.includes("Sources"));
ok("follow-up sent conversation history", calls.at(-1).body.messages.length === 3);
await p.screenshot({ path: TEST_DIR + "/shot-2-followup.png" });

// 5) hadith
await p.locator("#sanad-root .new").click();
await selectAndVerify("p2");
await p.locator("#sanad-root .card:not(.draft)").first().waitFor({ timeout: 8000 });
card = await p.locator("#sanad-root .card:not(.draft)").last().innerText();
ok("China hadith → weak or fabricated", card.includes("Weak or fabricated"));
await p.screenshot({ path: TEST_DIR + "/shot-3-hadith.png" });

// 6) reflection
await p.locator("#sanad-root .new").click();
await selectAndVerify("p3");
await p.locator("#sanad-root .card:not(.draft)").first().waitFor({ timeout: 8000 });
card = await p.locator("#sanad-root .card:not(.draft)").last().innerText();
ok("reflection → 'General reflection — not a narration', no score", card.includes("General reflection") && !card.includes("Support from sources"));
await p.screenshot({ path: TEST_DIR + "/shot-4-reflection.png" });

// 7) pasted fatwa question in chat box
await p.locator("#sanad-root .new").click();
await p.locator("#sanad-root textarea").fill("Is it allowed for me to marry without my father's permission in my country?");
await p.locator("#sanad-root form button").click();
await p.locator("#sanad-root .card:not(.draft)").first().waitFor({ timeout: 8000 });
card = await p.locator("#sanad-root .card:not(.draft)").last().innerText();
ok("fatwa request → out of scope with referral", card.includes("Out of scope") && card.toLowerCase().includes("refer to"));

// 8) XSS safety: page text with HTML is escaped
await p.evaluate(() => { document.getElementById("p3").textContent = '<img src=x onerror="window.__xss=1"> The Battle of Badr test'; });
await p.locator("#sanad-root .new").click();
await selectAndVerify("p3");
await p.locator("#sanad-root .card:not(.draft)").first().waitFor({ timeout: 8000 });
ok("selected HTML is rendered as text (no injection)", !(await p.evaluate(() => window.__xss)));

// 8b) time limits (idle limit is 1.5 s in this test copy)
await p.evaluate(() => { document.getElementById("p3").textContent = "The Hijra teaches that every great change starts with one brave step (slow stream test)."; });
await p.locator("#sanad-root .new").click();
await selectAndVerify("p3");
await p.locator("#sanad-root .card:not(.draft), #sanad-root .err").first().waitFor({ timeout: 20000 });
ok("a slow but steady reply is not cut off", (await p.locator("#sanad-root .msgs").innerText()).includes("General reflection"));
await p.evaluate(() => { document.getElementById("p3").textContent = "The Hijra teaches patience (stall test)."; });
await p.locator("#sanad-root .new").click();
await selectAndVerify("p3");
await p.locator("#sanad-root .err").last().waitFor({ timeout: 10000 });
ok("a reply that goes silent ends with the time-limit message", (await p.locator("#sanad-root .err").last().innerText()).includes("took too long"));

// 9) options page loads & saves
const opt = await ctx.newPage();
await opt.goto(`chrome-extension://${sw.url().split("/")[2]}/options.html`);
await opt.locator("#apiKey").waitFor();
ok("options page loads saved key", (await opt.locator("#apiKey").inputValue()) === "test-key");
await opt.locator("#useExtendedEnglish").check(); await opt.locator("#save").click();
await opt.locator("#status").filter({ hasText: "Saved" }).waitFor();
ok("options save works", (await sw.evaluate(() => chrome.storage.local.get("useExtendedEnglish"))).useExtendedEnglish === true);
await opt.screenshot({ path: TEST_DIR + "/shot-5-options.png" });
await opt.locator("#provider").selectOption("novita");
ok("choosing Novita fills its endpoint + GLM model and asks for a Tavily key",
  (await opt.locator("#apiBase").inputValue()) === "https://api.novita.ai/anthropic" &&
  (await opt.locator("#model").inputValue()) === "zai-org/glm-5.3" && await opt.locator("#searchKey").isVisible());
await opt.close();

// 10) Novita-style provider: the extension runs the search itself (mock Tavily)
await sw.evaluate(() => chrome.storage.local.set({ provider: "novita", model: "zai-org/glm-5.3", searchKey: "", searchApiBase: "http://localhost:8787" }));
await p.locator("#sanad-root .new").click();
await selectAndVerify("p1");
await p.locator("#sanad-root .err").last().waitFor({ timeout: 5000 });
ok("Novita without search key → asks for Tavily key", (await p.locator("#sanad-root .err").last().innerText()).includes("Tavily"));
await sw.evaluate(() => chrome.storage.local.set({ searchKey: "tvly-test" }));
const before = calls.length;
await p.locator("#sanad-root .new").click();
await watchLive();
await selectAndVerify("p1");
await p.locator("#sanad-root .card:not(.draft)").first().waitFor({ timeout: 8000 });
ok("Novita live: Tavily search shown with its approved pages only", await sawLive("hit", "غزوة بدر[\\s\\S]*dorar\\.net") && !(await sawLive("hit", "random-blog")));
ok("Novita live: draft answer shown before the audit", await sawLive("card draft", "still checking"));
card = await p.locator("#sanad-root .card:not(.draft)").last().innerText();
ok("Novita: Badr claim → 'Contradicts the sources' with verified link", card.includes("Contradicts the sources") && card.includes("verified link"));
const sc = searchCalls.at(-1);
ok("Novita: search sent to Tavily, approved domains only", sc?.headers.authorization === "Bearer tvly-test" &&
  sc.body.include_domains.includes("dorar.net") && sc.body.query.includes("غزوة بدر"));
const turns = calls.slice(before);
ok("Novita: search results sent back to the model", turns.length === 2 && turns[1].body.messages.at(-1).content[0].type === "tool_result" &&
  turns[1].body.messages.at(-1).content[0].content.includes("dorar.net"));
await p.screenshot({ path: TEST_DIR + "/shot-6-novita.png" });
await p.locator("#sanad-root textarea").fill("How many Muslims fought at Badr?");
await p.locator("#sanad-root form button").click();
await p.locator("#sanad-root .bubble.bot:not(.draft)").last().filter({ hasText: "three hundred" }).waitFor({ timeout: 8000 });
ok("Novita: follow-up answered with source link", (await p.locator("#sanad-root .bubble.bot:not(.draft)").last().innerText()).includes("Sources"));

// 11) Sanad reloaded while the page stays open: the old panel says so instead of throwing
const pageErrors = [];
p.on("pageerror", (e) => pageErrors.push(e.message));
await sw.evaluate(() => chrome.runtime.reload()).catch(() => {});
await p.waitForTimeout(1500);
await p.locator("#sanad-root .new").click();
await p.locator("#sanad-root .err").last().waitFor({ timeout: 5000 });
ok("after a reload, the open page asks for a refresh", (await p.locator("#sanad-root .err").last().innerText()).includes("Refresh this page"));
await selectAndVerify("p1");
await p.locator("#sanad-root .err", { hasText: "Refresh this page" }).nth(1).waitFor({ timeout: 5000 });
ok("after a reload, a check asks for a refresh too", true);
ok("after a reload, no uncaught errors", pageErrors.length === 0);

await ctx.close(); api.close(); web.close();
const failed = results.filter((r) => !r[1]);
console.log(`\n${results.length - failed.length}/${results.length} end-to-end checks passed`);
process.exit(failed.length ? 1 : 0);
