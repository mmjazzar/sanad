import assert from "node:assert/strict";
import { DEFAULT_SETTINGS, PROVIDERS, allowedDomains, buildVerifyRequest, buildFollowupRequest, processVerifyResponse, processFollowupResponse, extractJson,
  usesClientSearch, buildSearchRequest, searchResultsFrom, toServerSearchShape, runClientSearch,
  sseEvents, streamAccumulator, partialJson } from "../lib/core.js";
import { FIXTURES, TAVILY_BADR, toStreamEvents, sse } from "./fixtures.mjs";

let n = 0; const t = async (name, fn) => { await fn(); n++; console.log("✓", name); };
const S = { ...DEFAULT_SETTINGS, apiKey: "k" };
const D = allowedDomains(S);

await t("request restricts search to approved package domains", () => {
  const { body } = buildVerifyRequest(S, "The Battle of Badr was in 5 AH", "https://x.com");
  const tool = body.tools[0];
  assert.equal(tool.type, "web_search_20250305");
  assert.deepEqual(tool.allowed_domains, ["dorar.net", "shamela.ws", "quranpedia.net", "islamic-content.com", "dawa.center"]);
  assert.ok(body.system.includes("Never invent a hadith"));
});
await t("extended English sources only when enabled", () => {
  assert.ok(!D.includes("sunnah.com"));
  assert.ok(allowedDomains({ ...S, useExtendedEnglish: true }).includes("sunnah.com"));
});
await t("extra domains are normalized", () => {
  assert.ok(allowedDomains({ ...S, extraDomains: "https://www.example.org/path, foo.com" }).includes("www.example.org"));
});
await t("seerah contradiction keeps verdict with verified source", () => {
  const r = processVerifyResponse(FIXTURES.badr, D);
  assert.equal(r.verdict, "contradicts_sources");
  assert.equal(r.support_score, 5);
  assert.equal(r.audit.verified_sources, 1);
  assert.equal(r.sources[0].verified, true);
  assert.deepEqual(r.audit.searches, ["غزوة بدر السنة الثانية للهجرة"]);
});
await t("weak/fabricated hadith verdict preserved", () => {
  const r = processVerifyResponse(FIXTURES.china, D);
  assert.equal(r.verdict, "weak_or_fabricated");
  assert.equal(r.tone, "bad");
});
await t("reflection gets no score", () => {
  const r = processVerifyResponse(FIXTURES.reflection, D);
  assert.equal(r.verdict, "general_reflection");
  assert.equal(r.support_score, null);
});
await t("hallucinated / off-list sources are flagged and 'sourced' is downgraded", () => {
  const r = processVerifyResponse(FIXTURES.hallucinated, D);
  assert.equal(r.verdict, "insufficient_evidence");
  assert.equal(r.support_score, null);
  assert.equal(r.audit.verified_sources, 0);
  assert.ok(r.sources.every((s) => !s.verified));
  assert.ok(r.audit.notes.some((x) => x.includes("Downgraded")));
});
await t("'sourced' without any search is downgraded", () => {
  const r = processVerifyResponse(FIXTURES.nosearch_sourced, D);
  assert.equal(r.verdict, "insufficient_evidence");
});
await t("fatwa request stays out of scope without search", () => {
  const r = processVerifyResponse(FIXTURES.fatwa, D);
  assert.equal(r.verdict, "out_of_scope");
  assert.ok(r.referral);
});
await t("non-JSON answer degrades safely", () => {
  const r = processVerifyResponse(FIXTURES.broken, D);
  assert.equal(r.verdict, "insufficient_evidence");
});
await t("JSON extraction tolerates prose and fences", () => {
  assert.deepEqual(extractJson('Here:\n```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(extractJson('x {"a":{"b":2}} y'), { a: { b: 2 } });
  assert.equal(extractJson("no json"), null);
});
await t("follow-up joins text and keeps approved citations", () => {
  const r = processFollowupResponse(FIXTURES.followup, D);
  assert.ok(r.text.includes("three hundred") && r.text.includes("differ"));
  assert.equal(r.citations.length, 1);
});
await t("follow-up request carries history", () => {
  const { body } = buildFollowupRequest(S, [{ role: "user", content: "a" }, { role: "assistant", content: "b" }], "how many?");
  assert.equal(body.messages.length, 3);
});

// ---------- client-side search (Novita + Tavily) ----------
const NS = { ...S, provider: "novita", ...PROVIDERS.novita, searchKey: "tvly-k" };
const BADR_URL = "https://dorar.net/history/event/1/badr-test";
const badrSearch = { query: "غزوة بدر", results: searchResultsFrom(TAVILY_BADR, D) };
const answerText = (sources) => [{ type: "text", text: "```json\n" + JSON.stringify({ verdict: "contradicts_sources", support_score: 5, headline: "2 AH", sources }) + "\n```" }];

await t("Anthropic keeps server web search; Novita gets a client search tool", () => {
  assert.equal(usesClientSearch(S), false);
  assert.equal(buildVerifyRequest(S, "x").body.tools[0].type, "web_search_20250305");
  const { body, maxSearches } = buildVerifyRequest(NS, "x");
  assert.equal(body.model, "zai-org/glm-5.3");
  assert.equal(body.tools[0].name, "web_search");
  assert.equal(body.tools[0].type, undefined);
  assert.ok(body.tools[0].input_schema.properties.query);
  assert.equal(maxSearches, 5);
  assert.equal(buildFollowupRequest(NS, [], "q").maxSearches, 3);
  assert.deepEqual(body.thinking, { type: "disabled" });
  assert.equal(buildVerifyRequest(S, "x").body.thinking, undefined);
});
await t("search request is restricted to the approved domains", () => {
  const { url, init } = buildSearchRequest(NS, "غزوة بدر", D);
  assert.equal(url, "https://api.tavily.com/search");
  assert.equal(init.headers.authorization, "Bearer tvly-k");
  assert.deepEqual(JSON.parse(init.body).include_domains, D);
});
await t("search results from off-list sites are dropped", () => {
  assert.deepEqual(badrSearch.results.map((r) => r.url), [BADR_URL]);
});
await t("client search run passes the audit when the source was found", () => {
  const r = processVerifyResponse(toServerSearchShape([badrSearch], answerText([{ url: BADR_URL }])), D);
  assert.equal(r.verdict, "contradicts_sources");
  assert.equal(r.audit.verified_sources, 1);
  assert.deepEqual(r.audit.searches, ["غزوة بدر"]);
});
await t("client search run: invented source is downgraded", () => {
  const r = processVerifyResponse(toServerSearchShape([badrSearch], answerText([{ url: "https://dorar.net/encyclopedia/3811/x" }])), D);
  assert.equal(r.verdict, "insufficient_evidence");
  assert.equal(r.audit.verified_sources, 0);
});
await t("client search run: answer without searching is downgraded", () => {
  const r = processVerifyResponse(toServerSearchShape([], answerText([{ url: BADR_URL }])), D);
  assert.equal(r.verdict, "insufficient_evidence");
});
await t("client search errors show in the audit", () => {
  const r = processVerifyResponse(toServerSearchShape([{ query: "q", results: [], error: "Unauthorized" }], answerText([])), D);
  assert.ok(r.audit.notes.some((x) => x.includes("Unauthorized")));
});
await t("client follow-up cites only searched URLs that the answer mentions", () => {
  const encoded = "https://www.dorar.net/history/event/1/badr-test.";
  const fu = processFollowupResponse(toServerSearchShape([badrSearch],
    [{ type: "text", text: `About 313 (see ${encoded}). Not https://dorar.net/other-page` }]), D);
  assert.deepEqual(fu.citations.map((c) => c.url), [BADR_URL]);
  assert.deepEqual(fu.searches, ["غزوة بدر"]);
});

// runClientSearch with a scripted model: each entry is one model reply
const toolCall = (query) => ({ stop_reason: "tool_use", content: [{ type: "thinking", thinking: "…" }, { type: "tool_use", id: "tu", name: "web_search", input: { query } }] });
const say = (text, stop_reason = "end_turn") => ({ stop_reason, content: text ? [{ type: "text", text }] : [{ type: "thinking", thinking: "…" }] });
const FINAL = answerText([{ url: BADR_URL }])[0].text;
async function runScripted(replies, opts = {}) {
  const sent = [];
  const out = await runClientSearch({
    body: { messages: [{ role: "user", content: "verify" }] }, maxSearches: 5, wantJson: true, ...opts,
    callModel: async (b) => { sent.push([...b.messages]); return replies.shift(); },
    search: async (query) => ({ query, results: badrSearch.results }),
  });
  return { r: processVerifyResponse(out, D), sent };
}
await t("client loop: search, then answer → verified", async () => {
  const { r, sent } = await runScripted([toolCall("غزوة بدر"), say(FINAL)]);
  assert.equal(r.verdict, "contradicts_sources");
  assert.equal(r.audit.verified_sources, 1);
  assert.equal(sent[1].at(-1).content[0].type, "tool_result");
  assert.ok(sent[1].at(-1).content[0].content.includes(BADR_URL));
});
await t("client loop: model announces a search and stops → nudged to continue", async () => {
  const { r, sent } = await runScripted([say("Let me search the approved sources."), toolCall("اطلبوا العلم"), say(FINAL)]);
  assert.equal(r.verdict, "contradicts_sources");
  assert.ok(sent[1].at(-1).content.includes("call the web_search tool"));
});
await t("client loop: reply with no text (out of tokens while thinking) → retried", async () => {
  const { r, sent } = await runScripted([say("", "max_tokens"), toolCall("غزوة بدر"), say(FINAL)]);
  assert.equal(r.verdict, "contradicts_sources");
  assert.equal(sent[1].length, 1);   // same request again, nothing appended
});
await t("client loop: stops searching at the limit", async () => {
  const { r, sent } = await runScripted([toolCall("a"), toolCall("b"), say(FINAL)], { maxSearches: 1 });
  assert.equal(r.audit.searches.length, 1);
  assert.ok(sent[2].at(-1).content[0].content.includes("Search limit reached"));
});
await t("client loop: searches asked for in one turn run in parallel", async () => {
  let active = 0, peak = 0;
  const two = { stop_reason: "tool_use", content: [
    { type: "tool_use", id: "t1", name: "web_search", input: { query: "a" } },
    { type: "tool_use", id: "t2", name: "web_search", input: { query: "b" } }] };
  const replies = [two, say(FINAL)];
  const progress = [];
  const out = await runClientSearch({
    body: { messages: [{ role: "user", content: "verify" }] }, maxSearches: 5, wantJson: true,
    callModel: async () => replies.shift(),
    search: async (query) => { active++; peak = Math.max(peak, active); await new Promise((r) => setTimeout(r, 20)); active--; return { query, results: badrSearch.results }; },
    onProgress: (text) => progress.push(text),
  });
  assert.equal(peak, 2);
  assert.deepEqual(processVerifyResponse(out, D).audit.searches, ["a", "b"]);
  assert.deepEqual(progress, ["Reading the passage…", "Searching: a · b", "Reading 2 results from 2 searches…"]);
});
await t("client loop: gives up after two nudges and the audit downgrades", async () => {
  const { r } = await runScripted([say("Let me search."), say("Searching now."), say("Done.")]);
  assert.equal(r.verdict, "insufficient_evidence");
});
// streaming
await t("stream: a streamed reply rebuilds to the same reply, however the bytes are split", () => {
  for (const reply of [FIXTURES.badr, { stop_reason: "tool_use", content: [{ type: "tool_use", id: "tu", name: "web_search", input: { query: "غزوة بدر" } }] }]) {
    const raw = toStreamEvents(reply).map(sse).join("");
    for (const size of [7, 64, raw.length]) {
      const acc = streamAccumulator();
      let buf = "";
      for (let i = 0; i < raw.length; i += size) {
        const { events, rest } = sseEvents(buf + raw.slice(i, i + size));
        buf = rest;
        events.forEach((e) => acc.add(e));
      }
      assert.deepEqual(acc.message.content, reply.content);
      assert.equal(acc.message.stop_reason, reply.stop_reason);
    }
  }
});
await t("stream: an error event is raised", () => {
  assert.throws(() => streamAccumulator().add({ type: "error", error: { type: "overloaded_error", message: "Overloaded" } }), /Overloaded/);
});
await t("partial JSON: fields appear as they are written, unfinished numbers and keys are left out", () => {
  const full = "```json\n" + JSON.stringify({ verdict: "sourced", support_score: 85, headline: "Badr was in \"2 AH\"", sources: [{ title: "t1", url: "https://dorar.net/a" }] }, null, 1) + "\n```";
  for (let k = 0; k <= full.length; k++) partialJson(full.slice(0, k));   // never throws
  const at = (needle) => partialJson(full.slice(0, full.indexOf(needle)));
  assert.deepEqual(at("85"), { verdict: "sourced" });
  assert.deepEqual(at("5,"), { verdict: "sourced" });
  assert.deepEqual(at("2 AH"), { verdict: "sourced", support_score: 85, headline: "Badr was in \"" });
  assert.deepEqual(at("\"url\""), { verdict: "sourced", support_score: 85, headline: "Badr was in \"2 AH\"", sources: [{ title: "t1" }] });
  assert.equal(partialJson("Let me search the approved sources."), null);
});
await t("client loop: each search is reported as soon as it finishes", async () => {
  const two = { stop_reason: "tool_use", content: [
    { type: "tool_use", id: "t1", name: "web_search", input: { query: "slow" } },
    { type: "tool_use", id: "t2", name: "web_search", input: { query: "fast" } }] };
  const replies = [two, say(FINAL)];
  const seen = [];
  await runClientSearch({
    body: { messages: [{ role: "user", content: "verify" }] }, maxSearches: 5, wantJson: true,
    callModel: async () => replies.shift(),
    search: async (query) => { await new Promise((r) => setTimeout(r, query === "slow" ? 40 : 5)); return { query, results: [] }; },
    onSearch: (r) => seen.push(r.query),
  });
  assert.deepEqual(seen, ["fast", "slow"]);
});
console.log(`\n${n} unit tests passed`);
