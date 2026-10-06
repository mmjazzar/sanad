import {
  DEFAULT_SETTINGS, VERDICTS, buildVerifyRequest, buildFollowupRequest,
  processVerifyResponse, processFollowupResponse, finalText, partialJson,
  sseEvents, streamAccumulator, usesClientSearch, runClientSearch, searchApproved,
} from "./lib/core.js";

async function getSettings() {
  const s = await chrome.storage.local.get(Object.keys(DEFAULT_SETTINGS));
  return { ...DEFAULT_SETTINGS, ...s };
}

// Without limits a stalled provider leaves the panel spinning forever. A reply that keeps
// streaming may take as long as the check allows; one that goes silent is stopped.
const IDLE_TIMEOUT_MS = 60_000;     // nothing received from the provider for this long
const CHECK_TIMEOUT_MS = 270_000;   // a whole check (Chrome drops an extension request after 5 minutes)

// Asks for a streamed reply and passes each stream event to onEvent(event, replySoFar).
// Returns the complete reply in the same shape as a non-streamed one.
async function callClaude(settings, body, signal, onEvent = () => {}) {
  const idle = new AbortController();
  let idleTimer;
  const stillAlive = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => idle.abort(), IDLE_TIMEOUT_MS);
  };
  const stop = AbortSignal.any([signal, idle.signal]);
  stillAlive();
  try {
    const res = await fetch(`${settings.apiBase.replace(/\/+$/, "")}/v1/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": settings.apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({ ...body, stream: true }),
      signal: stop,
    });
    if (!res.ok || !(res.headers.get("content-type") || "").includes("event-stream")) {
      // an error, or a provider that ignored stream: true
      let data = {};
      try { data = JSON.parse(await res.text()); } catch {}
      if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);
      return data;
    }
    const reply = streamAccumulator();
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = "";
    for (;;) {
      const { value, done } = await reader.read();
      stillAlive();
      const { events, rest } = sseEvents(buffer + (done ? "\n\n" : value));
      buffer = rest;
      for (const ev of events) { reply.add(ev); onEvent(ev, reply.message); }
      if (done) return reply.message;
    }
  } catch (e) {
    // Chrome reports a stream stopped by our limits as "BodyStreamBuffer was aborted"
    throw stop.aborted ? new Error("TIMEOUT") : e;
  } finally {
    clearTimeout(idleTimer);
  }
}

// Sends what is ready to the chat panel while the check runs: each search with the pages it
// found, then the answer as the model writes it. The audited answer replaces all of it at the end.
function liveView(tabId, wantJson) {
  const send = (msg) => { if (tabId >= 0) chrome.tabs.sendMessage(tabId, msg).catch(() => {}); };
  const progress = (text) => send({ type: "SANAD_PROGRESS", text });
  const search = (r) => send({ type: "SANAD_SEARCH", query: r.query, error: r.error,
    results: (r.results || []).map(({ url, title }) => ({ url, title })) });
  let latest = null, timer = null, sentAt = 0;
  const flush = () => { timer = null; sentAt = Date.now(); send(latest); };
  function onEvent(ev, reply) {
    const block = reply.content[ev.index];
    if (ev.type === "content_block_start" && block?.type === "thinking") progress("Thinking…");
    // Anthropic runs its web search inside the stream
    if (ev.type === "content_block_stop" && block?.type === "server_tool_use") progress(`Searching: ${block.input?.query || ""}`);
    if (ev.type === "content_block_start" && block?.type === "web_search_tool_result") {
      const use = reply.content.find((b) => b.type === "server_tool_use" && b.id === block.tool_use_id);
      search({ query: use?.input?.query || "", error: Array.isArray(block.content) ? undefined : block.content?.error_code,
        results: Array.isArray(block.content) ? block.content.filter((r) => r.type === "web_search_result") : [] });
    }
    if (ev.type !== "content_block_delta" || ev.delta.type !== "text_delta") return;
    const text = finalText(reply.content);
    if (wantJson) {
      const draft = partialJson(text);
      if (!draft) return;
      const v = VERDICTS[draft.verdict];
      latest = { type: "SANAD_DRAFT", draft: { ...draft, verdict_label: v?.label, tone: v?.tone } };
    } else latest = { type: "SANAD_DRAFT", text };
    timer ??= setTimeout(flush, Math.max(0, sentAt + 150 - Date.now()));
  }
  return { progress, search, onEvent, stop: () => clearTimeout(timer) };
}

// Chrome stops an extension service worker after ~30 s without extension events or API calls,
// which is shorter than a model reply can take. Any API call resets that timer.
async function keepAlive(work) {
  const timer = setInterval(() => chrome.runtime.getPlatformInfo(), 20_000);
  try { return await work(); } finally { clearInterval(timer); }
}

async function run(settings, tabId, { body, domains, maxSearches }, wantJson) {
  const signal = AbortSignal.timeout(CHECK_TIMEOUT_MS);
  const live = liveView(tabId, wantJson);
  const callModel = (b) => callClaude(settings, b, signal, live.onEvent);
  try {
    return await keepAlive(() => usesClientSearch(settings)
      ? runClientSearch({ body, maxSearches, wantJson, callModel,
          search: (query) => searchApproved(settings, query, domains),
          onProgress: live.progress, onSearch: live.search })
      : callModel(body));
  } finally {
    live.stop();
  }
}

function checkKeys(settings) {
  if (!settings.apiKey) throw new Error("NO_KEY");
  if (usesClientSearch(settings) && !settings.searchKey) throw new Error("NO_SEARCH_KEY");
}

// conversation memory per tab (kept in the service worker session only)
const sessions = new Map();

async function verify(tabId, passage, pageUrl) {
  const settings = await getSettings();
  checkKeys(settings);
  const req = buildVerifyRequest(settings, passage, pageUrl);
  const data = await run(settings, tabId, req, true);
  const result = processVerifyResponse(data, req.domains);
  const assistantText = JSON.stringify({ ...result, audit: undefined });
  sessions.set(tabId, [req.body.messages[0], { role: "assistant", content: assistantText }]);
  return result;
}

async function followup(tabId, question) {
  const settings = await getSettings();
  checkKeys(settings);
  const history = sessions.get(tabId) || [];
  const req = buildFollowupRequest(settings, history, question);
  const data = await run(settings, tabId, req, false);
  const out = processFollowupResponse(data, req.domains);
  sessions.set(tabId, [...req.body.messages, { role: "assistant", content: out.text || "(no answer)" }].slice(-10));
  return out;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const tabId = sender.tab?.id ?? msg.tabId ?? -1;
  if (msg.type === "SANAD_VERIFY") {
    verify(tabId, msg.text, msg.pageUrl).then(
      (result) => sendResponse({ ok: true, result }),
      (e) => sendResponse({ ok: false, error: e.message })
    );
    return true;
  }
  if (msg.type === "SANAD_FOLLOWUP") {
    followup(tabId, msg.question).then(
      (result) => sendResponse({ ok: true, result }),
      (e) => sendResponse({ ok: false, error: e.message })
    );
    return true;
  }
  if (msg.type === "SANAD_RESET") { sessions.delete(tabId); sendResponse({ ok: true }); }
  if (msg.type === "SANAD_OPEN_OPTIONS") { chrome.runtime.openOptionsPage(); sendResponse({ ok: true }); }
});

chrome.runtime.onInstalled.addListener(async (details) => {
  chrome.contextMenus.create({ id: "sanad-verify", title: "Verify with Sanad", contexts: ["selection"] });
  if (details.reason === "install") {
    const s = await chrome.storage.local.get("apiKey");
    if (!s.apiKey) chrome.runtime.openOptionsPage();
  }
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "sanad-verify" && tab?.id != null) {
    chrome.tabs.sendMessage(tab.id, { type: "SANAD_OPEN", text: info.selectionText || "" }).catch(() => {});
  }
});
