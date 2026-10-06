// Sanad core — shared by the background service worker and the Node tests.
// Pure functions only (no chrome.* APIs here).

export const PACKAGE_DOMAINS = [
  "dorar.net",            // hadith, seerah/history, tafsir, aqeeda (approved package)
  "shamela.ws",           // approved printed editions of hadith books
  "quranpedia.net",       // Quran text & approved translations
  "islamic-content.com",  // Al-Jamhara terminology encyclopedia
  "dawa.center",          // Dawa repository / Q&A
];

// Optional English-language sources. NOT part of the challenge's approved package;
// off by default and clearly labelled in the UI.
export const EXTENDED_EN_DOMAINS = ["sunnah.com", "quran.com"];

// Anthropic runs web search on its own servers. Other Anthropic-compatible APIs (Novita) don't,
// so for those the extension runs each search itself through Tavily (see usesClientSearch).
export const PROVIDERS = {
  anthropic: { label: "Anthropic (Claude)", apiBase: "https://api.anthropic.com", model: "claude-sonnet-4-6" },
  // GLM gave the same verdicts with thinking off in live tests, 2-3x faster and without
  // running out of tokens mid-thought
  novita:    { label: "Novita (GLM)",       apiBase: "https://api.novita.ai/anthropic", model: "zai-org/glm-5.3",
               body: { thinking: { type: "disabled" } } },
};

export const DEFAULT_SETTINGS = {
  provider: "anthropic",
  apiKey: "",
  model: "claude-sonnet-4-6",
  answerLanguage: "English",
  useExtendedEnglish: false,
  extraDomains: "",
  apiBase: "https://api.anthropic.com",
  maxSearches: 5,
  searchKey: "",                          // Tavily key, only used when usesClientSearch()
  searchApiBase: "https://api.tavily.com",
};

export const VERDICTS = {
  sourced:                  { label: "Sourced — found in approved sources",        tone: "good" },
  has_basis_with_variation: { label: "Has a basis — details vary between sources", tone: "mid"  },
  weak_or_fabricated:       { label: "Weak or fabricated per hadith scholars",       tone: "bad"  },
  contradicts_sources:      { label: "Contradicts the sources",                      tone: "bad"  },
  no_basis:                 { label: "No basis found in approved sources",           tone: "bad"  },
  general_reflection:       { label: "General reflection — not a narration",         tone: "info" },
  out_of_scope:             { label: "Out of scope — ask a qualified scholar",       tone: "info" },
  insufficient_evidence:    { label: "Not enough evidence to judge",                 tone: "info" },
};

const NEEDS_SOURCES = new Set(["sourced", "has_basis_with_variation", "weak_or_fabricated", "contradicts_sources"]);
const NO_SEARCH_OK = new Set(["general_reflection", "out_of_scope"]);

export function allowedDomains(settings) {
  const extra = (settings.extraDomains || "")
    .split(/[\s,]+/).map((d) => d.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, ""))
    .filter(Boolean);
  const list = [...PACKAGE_DOMAINS, ...(settings.useExtendedEnglish ? EXTENDED_EN_DOMAINS : []), ...extra];
  return [...new Set(list)];
}

export function usesClientSearch(settings) {
  return (settings.provider || "anthropic") !== "anthropic";
}

function searchTool(settings, domains, maxUses) {
  if (!usesClientSearch(settings))
    return { type: "web_search_20250305", name: "web_search", max_uses: maxUses, allowed_domains: domains };
  return {
    name: "web_search",
    description: `Search the approved sources only (${domains.join(", ")}). Returns page titles, URLs and excerpts.`,
    input_schema: { type: "object", properties: { query: { type: "string", description: "precise search query, preferably in Arabic" } }, required: ["query"] },
  };
}

export function systemPrompt(settings, domains) {
  const lang = settings.answerLanguage || "English";
  return `You are Sanad, a source-verification assistant for Islamic content, focused on the Seerah (Prophetic biography), hadith, and Quran quotations. Users are mostly non-Arabic speakers who select a passage on a web page (usually English) and ask whether it is grounded in authoritative sources.

YOUR JOB IS VERIFICATION, NOT GENERATION.
1. Identify the checkable claim(s) in the passage. Decide what kind of text it is: hadith (a saying/action attributed to the Prophet ﷺ), seerah (a historical event), quran (a quoted verse), general_reflection (sermon-style reflection, life lesson, opinion — not a narration), fatwa_request (asks for a personal ruling), or other.
2. Search ONLY the approved sources (the search tool is restricted to: ${domains.join(", ")}). Most of these sites are in Arabic: translate the claim into precise Arabic search queries (key Arabic wording of the hadith, names, places, Hijri years). Run several focused searches when needed.
3. Judge only from what the search results actually show. Never rely on memory for a source, a grading, or a page. Never invent a hadith, a reference, a quote, or a URL. Every source you list MUST be a URL that appeared in your search results.
4. If you could not find adequate evidence, say so (verdict "insufficient_evidence" or "no_basis") — abstaining is better than guessing.

CONTENT LEVELS (from the challenge's scientific package):
- A: settled core information (Quran text, sahih hadith, basic seerah facts) → direct answer with source.
- B: explanation/lessons → show the reference, separate original text from your explanation, avoid categorical claims where scholars differ.
- C: disputed or sensitive matters (fiqh disagreement, contested historical details) → state that scholars/narrations differ, present the views, do not pick a side automatically; refer to specialists when needed.
- D: fatwa or personal case → do not issue a ruling; give general information only and refer to a qualified scholar (verdict "out_of_scope").

VERDICTS (pick exactly one):
- sourced: matches what approved sources report (support_score 80–100).
- has_basis_with_variation: the core is established but details differ between narrations/sources (50–79).
- weak_or_fabricated: a hadith that hadith scholars grade weak (da'if), very weak, or fabricated (mawdu'), per the grading shown on the source page (10–40). Quote the grading and the grader.
- contradicts_sources: the approved sources report something different (0–20). Provide the correction.
- no_basis: searched properly and found no basis in approved sources (0–20).
- general_reflection: a reflection/lesson/opinion, not a narration — it cannot be "authentic" or "fabricated". Mention the related established event if one exists (support_score null).
- out_of_scope: personal fatwa/ruling request (support_score null).
- insufficient_evidence: the evidence found is not enough to judge (support_score null).

QURAN: give surah name and number:ayah; take the Arabic text from the approved source; English is an explanatory translation of meaning. If the user's quote is altered, gently point out the correct wording.
HADITH: give the collection, the grading, and who graded it, exactly as shown on the source page (e.g. dorar.net shows the grader and the ruling).
TRANSPARENCY: you are an AI tool, not a scholar. Keep explanations short and clear for a non-Arabic speaker.

OUTPUT FORMAT for a verification request: reply with ONE JSON object only (no prose before or after), in a \`\`\`json code block:
{
  "claim_type": "hadith|seerah|quran|general_reflection|fatwa_request|other",
  "content_level": "A|B|C|D",
  "claim_summary": "the claim being checked, in one sentence (${lang})",
  "verdict": "<one verdict key>",
  "support_score": <integer 0-100 or null>,
  "headline": "one-sentence answer (${lang})",
  "explanation": "2–5 sentences explaining what the sources show (${lang})",
  "correction": "the correct information per the sources, or null",
  "disagreement": "how narrations/scholars differ, or null",
  "referral": "who to ask (for level C/D), or null",
  "sources": [
    {
      "title": "page or book title",
      "url": "exact URL from the search results",
      "locator": "book/chapter/volume/page or hadith number, if shown",
      "grading": "hadith grading + grader, if applicable, else null",
      "excerpt_ar": "short Arabic excerpt from the page (max ~25 words), or null",
      "excerpt_en": "${lang} translation of the excerpt (explanatory), or null"
    }
  ],
  "caveats": "limits of this check, or null"
}
For follow-up questions in the chat, answer in ${lang} in short plain text (no JSON), cite the URLs you rely on, and keep the same rules.`;
}

export function buildVerifyRequest(settings, passage, pageUrl) {
  const domains = allowedDomains(settings);
  const maxSearches = Number(settings.maxSearches) || 5;
  const user = `Verify this passage${pageUrl ? ` (selected on ${pageUrl})` : ""}:\n"""\n${passage.slice(0, 4000)}\n"""`;
  return {
    body: {
      model: settings.model,
      max_tokens: usesClientSearch(settings) ? 8000 : 2500,
      system: systemPrompt(settings, domains),
      messages: [{ role: "user", content: user }],
      tools: [searchTool(settings, domains, maxSearches)],
      ...PROVIDERS[settings.provider]?.body,
    },
    domains,
    maxSearches,
  };
}

export function buildFollowupRequest(settings, history, question) {
  const domains = allowedDomains(settings);
  return {
    body: {
      model: settings.model,
      max_tokens: usesClientSearch(settings) ? 4000 : 1500,
      system: systemPrompt(settings, domains),
      messages: [...history, { role: "user", content: question.slice(0, 2000) }],
      tools: [searchTool(settings, domains, 3)],
      ...PROVIDERS[settings.provider]?.body,
    },
    domains,
    maxSearches: 3,
  };
}

// ---------- client-side search (providers without server web search) ----------

export function buildSearchRequest(settings, query, domains) {
  return {
    url: `${settings.searchApiBase.replace(/\/+$/, "")}/search`,
    init: {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${settings.searchKey}` },
      body: JSON.stringify({ query: String(query).slice(0, 400), include_domains: domains, max_results: 6, search_depth: "advanced" }),
    },
  };
}

// a stuck Tavily request must not hold up the whole check
export const SEARCH_TIMEOUT_MS = 20_000;

export async function searchApproved(settings, query, domains) {
  const { url, init } = buildSearchRequest(settings, query, domains);
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { query, results: [], error: data?.detail?.error || data?.error || `search HTTP ${res.status}` };
    return { query, results: searchResultsFrom(data, domains) };
  } catch (e) {
    return { query, results: [], error: e.name === "TimeoutError" ? "search timed out" : e.message };
  }
}

export function searchResultsFrom(json, domains) {
  return (json?.results || [])
    .filter((r) => r.url && hostAllowed(hostOf(r.url), domains))
    .map((r) => ({ url: r.url, title: r.title || r.url, snippet: String(r.content || "").slice(0, 1200) }));
}

export function toolResultText(results) {
  if (!results.length) return "No results on the approved sources for this query.";
  return results.map((r, i) => `[${i + 1}] ${r.title}\nURL: ${r.url}\n${r.snippet}`).join("\n\n");
}

const NUDGE = "Continue. If you still need evidence, call the web_search tool now. Otherwise reply with the JSON object only.";

// Tool loop for providers without server-side web search: the model calls web_search, the
// extension runs it (approved domains only) and sends the results back.
// callModel(body) → API JSON; search(query) → { query, results, error? }.
// wantJson: a verify run is finished only once the answer contains the JSON object.
// onProgress(text): short status line for the chat panel; onSearch(result): one search finished.
export async function runClientSearch({ body, maxSearches, callModel, search, wantJson, onProgress = () => {}, onSearch = () => {} }) {
  const messages = [...body.messages];
  const searches = [];
  let nudges = 0;
  for (let turn = 0; turn < maxSearches + 4; turn++) {
    const found = searches.reduce((n, s) => n + s.results.length, 0);
    onProgress(searches.length ? `Reading ${found} results from ${searches.length} search${searches.length > 1 ? "es" : ""}…` : "Reading the passage…");
    const data = await callModel({ ...body, messages });
    const content = data.content || [];
    const uses = content.filter((b) => b.type === "tool_use");
    if (data.stop_reason === "tool_use" && uses.length) {
      // the searches the model asks for in one turn run in parallel, up to the limit
      const run = uses.slice(0, Math.max(0, maxSearches - searches.length));
      if (run.length) onProgress(`Searching: ${run.map((u) => u.input?.query || "").join(" · ")}`);
      const done = await Promise.all(run.map((u) => search(u.input?.query || "").then((r) => { onSearch(r); return r; })));
      searches.push(...done);
      const results = uses.map((u, i) => {
        const r = done[i];
        if (!r) return { type: "tool_result", tool_use_id: u.id, content: "Search limit reached. Give your final answer now." };
        return r.error
          ? { type: "tool_result", tool_use_id: u.id, content: `Search failed: ${r.error}`, is_error: true }
          : { type: "tool_result", tool_use_id: u.id, content: toolResultText(r.results) };
      });
      messages.push({ role: "assistant", content }, { role: "user", content: results });
      continue;
    }
    const text = content.filter((b) => b.type === "text").map((b) => b.text).join("");
    if ((wantJson ? extractJson(text) : text.trim()) || nudges >= 2) return toServerSearchShape(searches, content);
    // GLM sometimes announces a search and stops, or spends its whole budget thinking:
    // nudge it on (or just retry the turn when it produced no text at all).
    nudges++;
    if (text.trim()) messages.push({ role: "assistant", content: [{ type: "text", text }] }, { role: "user", content: NUDGE });
  }
  throw new Error("The model kept searching without giving an answer. Try again.");
}

// ---------- streaming ----------

// Split a Server-Sent Events buffer into complete events; `rest` is the unfinished tail.
export function sseEvents(buffer) {
  const parts = buffer.split(/\r?\n\r?\n/);
  const rest = parts.pop();
  const events = [];
  for (const part of parts) {
    const data = part.split(/\r?\n/).filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trimStart()).join("\n");
    if (!data || data === "[DONE]") continue;
    try { events.push(JSON.parse(data)); } catch {}
  }
  return { events, rest };
}

// Rebuild a Messages API reply from its stream events, so a streamed reply ends up in the same
// shape as a non-streamed one. add() throws on an error event.
export function streamAccumulator() {
  let message = { content: [] };
  const toolInput = [];   // partial JSON of tool inputs, by block index
  return {
    get message() { return message; },
    add(ev) {
      if (ev.type === "message_start") message = { ...ev.message, content: [] };
      else if (ev.type === "content_block_start") message.content[ev.index] = { ...ev.content_block };
      else if (ev.type === "content_block_delta") {
        const b = message.content[ev.index], d = ev.delta;
        if (d.type === "text_delta") b.text = (b.text || "") + d.text;
        else if (d.type === "input_json_delta") toolInput[ev.index] = (toolInput[ev.index] || "") + d.partial_json;
        else if (d.type === "thinking_delta") b.thinking = (b.thinking || "") + d.thinking;
        else if (d.type === "signature_delta") b.signature = d.signature;
        else if (d.type === "citations_delta") (b.citations ||= []).push(d.citation);
      } else if (ev.type === "content_block_stop") {
        if (toolInput[ev.index]) { try { message.content[ev.index].input = JSON.parse(toolInput[ev.index]); } catch {} }
      } else if (ev.type === "message_delta") {
        Object.assign(message, ev.delta);
        if (ev.usage) message.usage = { ...message.usage, ...ev.usage };
      } else if (ev.type === "error") throw new Error(ev.error?.message || "stream error");
    },
  };
}

// Read as much as possible of a JSON object that is still being written: unfinished strings are
// kept as they are so far, unfinished numbers and keys are left out.
export function partialJson(text) {
  const s = String(text || "");
  let i = s.indexOf("{");
  if (i < 0) return null;
  const ws = () => { while (i < s.length && /\s/.test(s[i])) i++; };
  const ESC = { n: "\n", t: "\t", r: "\r", b: "\b", f: "\f" };
  function str() {   // → [value, finished]
    let out = ""; i++;
    while (i < s.length) {
      const c = s[i++];
      if (c === '"') return [out, true];
      if (c !== "\\") { out += c; continue; }
      if (i >= s.length) break;
      const e = s[i++];
      if (e !== "u") { out += ESC[e] ?? e; continue; }
      if (i + 4 > s.length) break;
      out += String.fromCharCode(parseInt(s.slice(i, i + 4), 16)); i += 4;
    }
    i = s.length;
    return [out, false];
  }
  function value() {
    ws();
    if (s[i] === "{") return obj();
    if (s[i] === "[") return arr();
    if (s[i] === '"') return str();
    const m = /^(?:-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)/.exec(s.slice(i));
    if (m && i + m[0].length < s.length) { i += m[0].length; return [JSON.parse(m[0]), true]; }
    i = s.length;
    return [undefined, false];
  }
  function obj() {
    const o = {}; i++;
    for (;;) {
      ws();
      if (s[i] === "}") { i++; return [o, true]; }
      if (s[i] === ",") { i++; continue; }
      if (s[i] !== '"') return [o, false];
      const [k, kDone] = str();
      ws();
      if (!kDone || s[i] !== ":") return [o, false];
      i++;
      const [v, vDone] = value();
      if (v !== undefined) o[k] = v;
      if (!vDone) return [o, false];
    }
  }
  function arr() {
    const a = []; i++;
    for (;;) {
      ws();
      if (s[i] === "]") { i++; return [a, true]; }
      if (s[i] === ",") { i++; continue; }
      if (i >= s.length) return [a, false];
      const [v, vDone] = value();
      if (v !== undefined) a.push(v);
      if (!vDone) return [a, false];
    }
  }
  return obj()[0];
}

// Rebuild a client-search run in the shape of an Anthropic server web-search response, so
// processVerifyResponse / processFollowupResponse and the audit work unchanged.
// searches: [{ query, results: [{url, title}], error? }]; finalContent: the model's last content.
export function toServerSearchShape(searches, finalContent) {
  const content = [];
  searches.forEach((s, i) => {
    const id = `cs_${i}`;
    content.push({ type: "server_tool_use", id, name: "web_search", input: { query: s.query } });
    content.push({ type: "web_search_tool_result", tool_use_id: id,
      content: s.error ? { type: "web_search_tool_result_error", error_code: s.error }
        : s.results.map((r) => ({ type: "web_search_result", url: r.url, title: r.title })) });
  });
  const text = (finalContent || []).filter((b) => b.type === "text").map((b) => b.text).join("");
  // URLs from the search results that the answer mentions become its citations
  const found = new Map(searches.flatMap((s) => s.results || []).map((r) => [normUrl(r.url), r]));
  const cited = new Map();
  for (const u of text.match(/https?:\/\/[^\s)\]}"'<>,]+/g) || []) {
    const n = normUrl(u.replace(/[.;:]+$/, ""));
    if (found.has(n)) cited.set(n, found.get(n));
  }
  content.push({ type: "text", text,
    citations: [...cited.values()].map((r) => ({ type: "web_search_result_location", url: r.url, title: r.title })) });
  return { content };
}

// ---------- response parsing ----------

export function normUrl(u) {
  try {
    const x = new URL(u);
    let host = x.hostname.toLowerCase().replace(/^www\./, "");
    let path = decodeURIComponent(x.pathname).replace(/\/+$/, "");
    return host + path + (x.search || "");
  } catch { return String(u || "").trim().toLowerCase(); }
}

export function hostOf(u) {
  try { return new URL(u).hostname.toLowerCase().replace(/^www\./, ""); } catch { return ""; }
}

export function hostAllowed(host, domains) {
  return domains.some((d) => host === d || host.endsWith("." + d));
}

export function extractSearchInfo(content) {
  const queries = [];
  const results = [];
  const errors = [];
  for (const b of content || []) {
    if (b.type === "server_tool_use" && b.name === "web_search") queries.push(b.input?.query || "");
    if (b.type === "web_search_tool_result") {
      if (Array.isArray(b.content)) {
        for (const r of b.content) if (r.type === "web_search_result") results.push({ url: r.url, title: r.title });
      } else if (b.content?.type === "web_search_tool_result_error") {
        errors.push(b.content.error_code || "search_error");
      }
    }
  }
  return { queries, results, errors };
}

export function finalText(content) {
  // text after the last tool result block (Claude's final answer), concatenated
  let last = -1;
  (content || []).forEach((b, i) => { if (b.type === "web_search_tool_result" || b.type === "server_tool_use") last = i; });
  return (content || []).slice(last + 1).filter((b) => b.type === "text").map((b) => b.text).join("");
}

export function citationUrls(content) {
  const out = [];
  for (const b of content || []) if (b.type === "text" && Array.isArray(b.citations))
    for (const c of b.citations) if (c.url) out.push({ url: c.url, title: c.title });
  return out;
}

export function extractJson(text) {
  if (!text) return null;
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const cand = fence ? fence[1] : text;
  const s = cand.indexOf("{"), e = cand.lastIndexOf("}");
  if (s < 0 || e <= s) return null;
  try { return JSON.parse(cand.slice(s, e + 1)); } catch { return null; }
}

// The audit: every listed source must (1) be on an allowed domain and (2) appear in the
// actual search results or citations. Claims that need evidence are downgraded otherwise.
export function auditResult(parsed, content, domains) {
  const info = extractSearchInfo(content);
  const seen = new Set([...info.results, ...citationUrls(content)].map((r) => normUrl(r.url)));
  const seenList = [...seen];
  const sources = (parsed.sources || []).map((s) => {
    const n = normUrl(s.url);
    const inResults = seen.has(n) || seenList.some((x) => x.startsWith(n) || n.startsWith(x));
    const onAllowed = hostAllowed(hostOf(s.url), domains);
    return { ...s, verified: Boolean(s.url) && inResults && onAllowed, onAllowed, inResults };
  });
  const verified = sources.filter((s) => s.verified);
  const notes = [];
  let verdict = VERDICTS[parsed.verdict] ? parsed.verdict : "insufficient_evidence";
  let score = Number.isFinite(parsed.support_score) ? Math.max(0, Math.min(100, Math.round(parsed.support_score))) : null;

  if (sources.length && verified.length < sources.length)
    notes.push(`${sources.length - verified.length} listed source link(s) could not be matched to the search results or approved domains and are marked unverified.`);
  if (NEEDS_SOURCES.has(verdict) && verified.length === 0) {
    notes.push(`Downgraded from "${VERDICTS[verdict].label}": no source link could be verified.`);
    verdict = "insufficient_evidence"; score = null;
  }
  if (!NO_SEARCH_OK.has(verdict) && verdict !== "insufficient_evidence" && info.queries.length === 0) {
    notes.push("Downgraded: no search of the approved sources was performed.");
    verdict = "insufficient_evidence"; score = null;
  }
  if (["general_reflection", "out_of_scope", "insufficient_evidence"].includes(verdict)) score = null;
  if (info.errors.length) notes.push(`Search errors: ${info.errors.join(", ")}.`);

  return {
    ...parsed,
    verdict,
    support_score: score,
    verdict_label: VERDICTS[verdict].label,
    tone: VERDICTS[verdict].tone,
    sources,
    audit: {
      searches: info.queries,
      results_count: info.results.length,
      verified_sources: verified.length,
      listed_sources: sources.length,
      domains,
      notes,
    },
  };
}

export function processVerifyResponse(apiJson, domains) {
  const content = apiJson?.content || [];
  const text = finalText(content);
  const parsed = extractJson(text);
  if (!parsed) {
    return auditResult({ verdict: "insufficient_evidence", headline: "Sanad could not read a structured answer.",
      explanation: text ? text.slice(0, 800) : "Empty response.", sources: [] }, content, domains);
  }
  return auditResult(parsed, content, domains);
}

export function processFollowupResponse(apiJson, domains) {
  const content = apiJson?.content || [];
  const text = finalText(content) || content.filter((b) => b.type === "text").map((b) => b.text).join("");
  const cites = citationUrls(content).filter((c) => hostAllowed(hostOf(c.url), domains));
  const uniq = [];
  const s = new Set();
  for (const c of cites) { const n = normUrl(c.url); if (!s.has(n)) { s.add(n); uniq.push(c); } }
  return { text: text.trim(), citations: uniq, searches: extractSearchInfo(content).queries };
}
