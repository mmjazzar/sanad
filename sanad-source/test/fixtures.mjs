// Mock Claude API responses in the documented web_search format (server_tool_use →
// web_search_tool_result → text with citations). Used by unit and browser tests.
const search = (id, query, results) => [
  { type: "server_tool_use", id, name: "web_search", input: { query } },
  { type: "web_search_tool_result", tool_use_id: id,
    content: results.map(([url, title]) => ({ type: "web_search_result", url, title, encrypted_content: "x", page_age: null })) },
];
const answer = (obj, cites = []) => ({
  type: "text", text: "```json\n" + JSON.stringify(obj, null, 1) + "\n```",
  citations: cites.map(([url, title]) => ({ type: "web_search_result_location", url, title, encrypted_index: "x", cited_text: "..." })),
});
const msg = (content) => ({ id: "msg_test", type: "message", role: "assistant", model: "mock", content, stop_reason: "end_turn" });

const BADR = "https://dorar.net/history/event/1/badr-test";
const HADITH = "https://dorar.net/hadith/sharh/china-test";
const HIJRA = "https://dorar.net/history/event/1/hijra-test";

export const FIXTURES = {
  badr: msg([
    { type: "text", text: "I'll search the approved sources." },
    ...search("s1", "غزوة بدر السنة الثانية للهجرة", [[BADR, "غزوة بدر الكبرى - الموسوعة التاريخية - الدرر السنية"]]),
    answer({
      claim_type: "seerah", content_level: "A", claim_summary: "The Battle of Badr took place in the fifth year after the Hijra.",
      verdict: "contradicts_sources", support_score: 5,
      headline: "The approved sources place the Battle of Badr in Ramadan, 2 AH — not 5 AH.",
      explanation: "The historical encyclopedia on dorar.net dates Badr to Ramadan of the second year of the Hijra. The fifth year is associated with other events.",
      correction: "Badr took place in Ramadan, 2 AH.", disagreement: null, referral: null,
      sources: [{ title: "غزوة بدر الكبرى", url: BADR, locator: "الموسوعة التاريخية", grading: null,
        excerpt_ar: "كانت غزوة بدر في رمضان من السنة الثانية للهجرة", excerpt_en: "The Battle of Badr was in Ramadan of the second year of the Hijra." }],
      caveats: null }, [[BADR, "غزوة بدر الكبرى"]]),
  ]),
  china: msg([
    ...search("s1", "اطلبوا العلم ولو بالصين", [[HADITH, "اطلبوا العلم ولو بالصين - الدرر السنية"]]),
    answer({
      claim_type: "hadith", content_level: "A", claim_summary: "The Prophet ﷺ said: seek knowledge even if in China.",
      verdict: "weak_or_fabricated", support_score: 15,
      headline: "This saying is widely quoted, but hadith scholars graded it as not authentic.",
      explanation: "The hadith page on dorar.net shows the scholars' ruling on this narration. It should not be attributed to the Prophet ﷺ as an authentic saying.",
      correction: "Seeking knowledge is an obligation per other, authentic narrations.", disagreement: null, referral: null,
      sources: [{ title: "اطلبوا العلم ولو بالصين", url: HADITH, locator: "الموسوعة الحديثية", grading: "[test fixture grading]",
        excerpt_ar: "اطلبوا العلم ولو بالصين", excerpt_en: "Seek knowledge even if in China." }],
      caveats: "Test fixture." }),
  ]),
  reflection: msg([
    ...search("s1", "الهجرة النبوية", [[HIJRA, "الهجرة النبوية - الدرر السنية"]]),
    answer({
      claim_type: "general_reflection", content_level: "B", claim_summary: "The Hijra teaches that great change starts with a brave step.",
      verdict: "general_reflection", support_score: 70,
      headline: "This is a reflection, not a narration from the Seerah.",
      explanation: "It is a life lesson drawn from the Hijra. The Hijra itself is an established event, but this sentence is not a quote from any source.",
      correction: null, disagreement: null, referral: null,
      sources: [{ title: "الهجرة النبوية", url: HIJRA, locator: "الموسوعة التاريخية", grading: null, excerpt_ar: null, excerpt_en: null }],
      caveats: null }),
  ]),
  hallucinated: msg([
    ...search("s1", "حديث مختلق", [["https://dorar.net/hadith/search?q=x", "نتائج البحث"]]),
    answer({
      claim_type: "hadith", content_level: "A", claim_summary: "A made-up hadith.",
      verdict: "sourced", support_score: 92, headline: "Authentic (claimed).", explanation: "…",
      sources: [{ title: "Invented page", url: "https://dorar.net/hadith/sharh/does-not-exist", grading: "صحيح" },
                { title: "Off-list site", url: "https://random-blog.example/hadith", grading: null }],
      caveats: null }),
  ]),
  fatwa: msg([
    answer({ claim_type: "fatwa_request", content_level: "D", claim_summary: "Personal marriage ruling.",
      verdict: "out_of_scope", support_score: null, headline: "This needs a qualified scholar.",
      explanation: "Sanad does not issue personal rulings.", correction: null, disagreement: null,
      referral: "A qualified mufti or your local fatwa authority.", sources: [], caveats: null }),
  ]),
  nosearch_sourced: msg([
    answer({ claim_type: "seerah", verdict: "sourced", support_score: 95, headline: "From memory.", sources: [] }),
  ]),
  broken: msg([{ type: "text", text: "Sorry, I could not complete that." }]),
  followup: msg([
    ...search("s2", "غزوة بدر عدد المسلمين", [[BADR, "غزوة بدر الكبرى"]]),
    { type: "text", text: "According to the approved source, the Muslims at Badr numbered a little over three hundred. ",
      citations: [{ type: "web_search_result_location", url: BADR, title: "غزوة بدر الكبرى", encrypted_index: "x", cited_text: "..." }] },
    { type: "text", text: "Exact figures differ slightly between narrations." },
  ]),
};

export function pickFixture(body) {
  const msgs = body.messages || [];
  const last = msgs[msgs.length - 1];
  const t = (typeof last.content === "string" ? last.content : JSON.stringify(last.content)).toLowerCase();
  if (msgs.length > 1) return FIXTURES.followup;
  if (t.includes("badr")) return FIXTURES.badr;
  if (t.includes("china")) return FIXTURES.china;
  if (t.includes("hijra teaches")) return FIXTURES.reflection;
  if (t.includes("marry")) return FIXTURES.fatwa;
  return FIXTURES.broken;
}

// ---------- client-side search (Novita-style provider + Tavily) ----------
// The model asks for the web_search tool; the extension runs it against Tavily.
export const TAVILY_BADR = { query: "x", results: [
  { url: BADR, title: "غزوة بدر الكبرى - الموسوعة التاريخية - الدرر السنية", content: "كانت غزوة بدر في رمضان من السنة الثانية للهجرة", score: 0.9 },
  { url: "https://random-blog.example/badr", title: "Off-list blog", content: "…", score: 0.5 },
] };

const toolUse = (query) => ({ ...msg([
  { type: "thinking", thinking: "I should search the approved sources.", signature: "" },
  { type: "tool_use", id: "tu_1", name: "web_search", input: { query } },
]), stop_reason: "tool_use" });

export function pickClientFixture(body) {
  const msgs = body.messages || [];
  const last = msgs[msgs.length - 1];
  if (Array.isArray(last.content) && last.content.some((b) => b.type === "tool_result")) {
    // second turn: answer from the search results (follow-ups answer in plain text)
    if (msgs.length > 3) return msg([{ type: "text", text: `About three hundred and thirteen Muslims fought at Badr (${BADR}).` }]);
    return msg(FIXTURES.badr.content.filter((b) => b.type === "text").slice(-1));
  }
  return toolUse("غزوة بدر السنة الثانية للهجرة");
}

// ---------- streaming ----------
// The stream events the Messages API sends for a reply (stream: true): text arrives in small
// pieces, tool inputs as partial JSON, search results whole.
export function toStreamEvents(reply, piece = 24) {
  const events = [{ type: "message_start", message: { ...reply, content: [], stop_reason: null } }];
  reply.content.forEach((b, index) => {
    if (b.type === "text") {
      events.push({ type: "content_block_start", index, content_block: { type: "text", text: "" } });
      for (let i = 0; i < b.text.length; i += piece)
        events.push({ type: "content_block_delta", index, delta: { type: "text_delta", text: b.text.slice(i, i + piece) } });
      for (const citation of b.citations || [])
        events.push({ type: "content_block_delta", index, delta: { type: "citations_delta", citation } });
    } else if (b.type === "tool_use" || b.type === "server_tool_use") {
      events.push({ type: "content_block_start", index, content_block: { ...b, input: {} } });
      events.push({ type: "content_block_delta", index, delta: { type: "input_json_delta", partial_json: JSON.stringify(b.input) } });
    } else if (b.type === "thinking") {
      events.push({ type: "content_block_start", index, content_block: { type: "thinking", thinking: "" } });
      events.push({ type: "content_block_delta", index, delta: { type: "thinking_delta", thinking: b.thinking } });
      events.push({ type: "content_block_delta", index, delta: { type: "signature_delta", signature: b.signature ?? "" } });
    } else events.push({ type: "content_block_start", index, content_block: b });
    events.push({ type: "content_block_stop", index });
  });
  events.push({ type: "message_delta", delta: { stop_reason: reply.stop_reason, stop_sequence: null }, usage: { output_tokens: 1 } });
  events.push({ type: "message_stop" });
  return events;
}
export const sse = (ev) => `event: ${ev.type}\ndata: ${JSON.stringify(ev)}\n\n`;
