(() => {
  if (window.__sanadLoaded) return;
  window.__sanadLoaded = true;

  const CSS = `
  :host { all: initial; }
  * { box-sizing: border-box; font-family: "Inter", "Segoe UI", system-ui, -apple-system, Arial, sans-serif; }
  .fab { position: fixed; z-index: 2147483646; display: none; align-items: center; gap: 6px;
    background: #12183F; color: #F2F4FF; border: 1px solid #2EF2C2; border-radius: 999px;
    padding: 7px 14px; font-size: 13px; font-weight: 600; cursor: pointer; box-shadow: 0 6px 20px rgba(18,24,63,.35); }
  .fab:hover { background: #1c2458; }
  .fab .dot { width: 8px; height: 8px; border-radius: 50%; background: #2EF2C2; }
  .panel { position: fixed; top: 12px; right: 12px; bottom: 12px; width: 420px; max-width: calc(100vw - 24px);
    z-index: 2147483647; display: none; flex-direction: column; background: #F7F8FF; color: #12183F;
    border-radius: 16px; overflow: hidden; box-shadow: 0 18px 60px rgba(18,24,63,.35); border: 1px solid #D9DCF2; }
  .panel.open { display: flex; }
  header { background: #12183F; color: #F2F4FF; padding: 14px 16px; display: flex; align-items: center; gap: 10px; }
  header .logo { width: 30px; height: 30px; border-radius: 8px; background: #2EF2C2; color: #12183F;
    display: grid; place-items: center; font-weight: 800; font-size: 15px; }
  header .t { flex: 1; } header .t b { display: block; font-size: 15px; } header .t span { font-size: 11.5px; color: #B9BEE0; }
  header button { background: transparent; border: 0; color: #B9BEE0; font-size: 18px; cursor: pointer; padding: 4px 6px; border-radius: 6px; }
  header button:hover { background: rgba(255,255,255,.1); color: #fff; }
  .msgs { flex: 1; overflow-y: auto; padding: 14px; display: flex; flex-direction: column; gap: 12px; }
  .bubble { border-radius: 12px; padding: 10px 12px; font-size: 13.5px; line-height: 1.5; white-space: pre-wrap; word-wrap: break-word; }
  .user { align-self: flex-end; background: #6150EA; color: #fff; max-width: 88%; }
  .user .q { font-style: italic; opacity: .95; }
  .bot { align-self: stretch; background: #fff; border: 1px solid #E3E6F7; }
  .card { background: #fff; border: 1px solid #E3E6F7; border-radius: 14px; padding: 14px; display: flex; flex-direction: column; gap: 10px; }
  .badge { display: inline-flex; align-items: center; gap: 8px; font-weight: 700; font-size: 13px; padding: 6px 10px; border-radius: 8px; align-self: flex-start; }
  .good { background: #DDF7EC; color: #0B6B47; } .mid { background: #FFF1D6; color: #8A5A00; }
  .bad { background: #FDE2DF; color: #A1281B; } .info { background: #E6E3FC; color: #3F31B8; }
  .meter { display: flex; align-items: center; gap: 10px; font-size: 12px; color: #4A5178; }
  .bar { flex: 1; height: 8px; border-radius: 4px; background: #ECEEF8; overflow: hidden; }
  .bar i { display: block; height: 100%; background: #6150EA; }
  .headline { font-weight: 700; font-size: 14.5px; line-height: 1.45; }
  .muted { color: #4A5178; font-size: 13px; line-height: 1.55; }
  .box { background: #F2F4FF; border-radius: 10px; padding: 10px 12px; font-size: 13px; line-height: 1.5; }
  .box b { display: block; font-size: 11.5px; text-transform: uppercase; letter-spacing: .04em; color: #6150EA; margin-bottom: 3px; }
  .src { border: 1px solid #E3E6F7; border-radius: 10px; padding: 10px 12px; display: flex; flex-direction: column; gap: 5px; font-size: 12.5px; }
  .src a { color: #3F31B8; font-weight: 600; text-decoration: none; } .src a:hover { text-decoration: underline; }
  .src .ar { direction: rtl; text-align: right; font-size: 14px; line-height: 1.7; color: #12183F; font-family: "Noto Naskh Arabic", "Amiri", "Segoe UI", Tahoma, serif; }
  .tag { display: inline-block; font-size: 11px; font-weight: 700; padding: 2px 7px; border-radius: 6px; }
  .tag.ok { background: #DDF7EC; color: #0B6B47; } .tag.no { background: #FDE2DF; color: #A1281B; }
  details { font-size: 12px; color: #4A5178; } summary { cursor: pointer; font-weight: 600; color: #12183F; }
  details ul { margin: 6px 0 0; padding-left: 18px; } details li { margin: 2px 0; }
  .loading { display: flex; align-items: center; gap: 10px; font-size: 13px; color: #4A5178; }
  .loading .lt { flex: 1; } .loading .el { color: #8A90B8; font-variant-numeric: tabular-nums; }
  .live { display: flex; flex-direction: column; gap: 10px; }
  .found { display: flex; flex-direction: column; gap: 6px; }
  .found:empty, .draft:empty { display: none; }
  .hit { background: #fff; border: 1px solid #E3E6F7; border-radius: 10px; padding: 8px 10px; font-size: 12px; color: #4A5178; }
  .hit .q { font-weight: 600; color: #12183F; }
  .hit .pages { display: flex; flex-direction: column; gap: 2px; margin-top: 4px; }
  .hit a { color: #3F31B8; text-decoration: none; } .hit a:hover { text-decoration: underline; }
  .card.draft, .bubble.draft { border-style: dashed; }
  .note { font-size: 11.5px; color: #8A5A00; background: #FFF8E6; border-radius: 6px; padding: 4px 8px; align-self: flex-start; }
  .tag.wait { background: #ECEEF8; color: #4A5178; }
  .spin { width: 16px; height: 16px; border: 2px solid #D9DCF2; border-top-color: #6150EA; border-radius: 50%; animation: s 0.8s linear infinite; }
  @keyframes s { to { transform: rotate(360deg); } }
  .err { background: #FDE2DF; color: #A1281B; border-radius: 10px; padding: 10px 12px; font-size: 13px; }
  .err a, .link { color: #3F31B8; cursor: pointer; text-decoration: underline; }
  form { display: flex; gap: 8px; padding: 10px; border-top: 1px solid #E3E6F7; background: #fff; }
  textarea { flex: 1; resize: none; border: 1px solid #D9DCF2; border-radius: 10px; padding: 9px 10px; font-size: 13px; height: 42px; color: #12183F; background: #fff; }
  textarea:focus { outline: 2px solid #6150EA; border-color: transparent; }
  form button { background: #6150EA; color: #fff; border: 0; border-radius: 10px; padding: 0 14px; font-weight: 700; cursor: pointer; font-size: 13px; }
  form button:disabled { opacity: .5; cursor: default; }
  .foot { font-size: 10.5px; color: #6B7199; padding: 0 12px 10px; background: #fff; }
  .cites { display: flex; flex-direction: column; gap: 3px; margin-top: 6px; font-size: 12px; }
  .cites a { color: #3F31B8; }
  `;

  const host = document.createElement("div");
  host.id = "sanad-root";
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `<style>${CSS}</style>
    <button class="fab" part="fab"><span class="dot"></span>Verify with Sanad</button>
    <div class="panel" role="dialog" aria-label="Sanad source checker">
      <header><div class="logo">س</div><div class="t"><b>Sanad · Source Checker</b><span>Hadith · Seerah · Quran — approved sources only</span></div>
        <button class="new" title="New check">↺</button><button class="close" title="Close">✕</button></header>
      <div class="msgs"></div>
      <form><textarea placeholder="Ask a follow-up, or paste a passage to verify…"></textarea><button type="submit">Send</button></form>
      <div class="foot">AI-assisted verification, not a fatwa. Always confirm with qualified scholars.</div>
    </div>`;
  (document.body || document.documentElement).appendChild(host);

  const fab = root.querySelector(".fab");
  const panel = root.querySelector(".panel");
  const msgs = root.querySelector(".msgs");
  const form = root.querySelector("form");
  const input = root.querySelector("textarea");
  const sendBtn = form.querySelector("button");
  let pendingText = "";
  let hasCheck = false;
  let busy = false;
  let current = null;   // the live block of the running check

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const safeUrl = (u) => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : ""; } catch { return ""; } };
  const scroll = () => { msgs.scrollTop = msgs.scrollHeight; };
  const nearBottom = () => msgs.scrollHeight - msgs.scrollTop - msgs.clientHeight < 80;
  const add = (html, cls = "") => { const d = document.createElement("div"); if (cls) d.className = cls; d.innerHTML = html; msgs.appendChild(d); scroll(); return d; };

  // After Sanad is reloaded or updated, an already open page keeps running the old copy of this
  // script, which can no longer reach the extension: report that instead of throwing.
  function send(msg, onReply = () => {}) {
    try {
      if (!chrome.runtime?.id) throw new Error("Extension context invalidated.");
      chrome.runtime.sendMessage(msg, (res) => onReply(chrome.runtime.lastError ? { ok: false, error: chrome.runtime.lastError.message } : res));
    } catch (e) {
      onReply({ ok: false, error: e.message });
    }
  }

  function openPanel() { panel.classList.add("open"); fab.style.display = "none"; }
  function closePanel() { panel.classList.remove("open"); }
  function reset() {
    msgs.innerHTML = ""; hasCheck = false; intro();
    send({ type: "SANAD_RESET" }, (res) => { if (!res?.ok) errorBox(res?.error || "Unknown error"); });
  }
  function intro() {
    add(`<div class="muted">Select any text on a page (English or Arabic) and press <b>Verify with Sanad</b>, or paste a passage below. Sanad checks it against the challenge's approved sources (dorar.net, shamela.ws, quranpedia.net, islamic-content.com, dawa.center) and shows the verdict, the sources, and an audit.</div>`, "bubble bot");
  }

  function setBusy(b) { busy = b; sendBtn.disabled = b; }

  function errorBox(msg) {
    const keyMsg = {
      NO_KEY: "Add your API key in Sanad's settings first.",
      NO_SEARCH_KEY: "Add a Tavily search key in Sanad's settings. The selected provider can't search the sources on its own.",
      TIMEOUT: "The AI provider took too long to answer, so Sanad stopped the check. Try again, or pick a faster model in settings.",
    }[msg];
    if (/Extension context invalidated/i.test(msg))
      return add(`<div class="err">Sanad was reloaded or updated. Refresh this page to use it again.</div>`);
    if (/message port closed/i.test(msg))
      return add(`<div class="err">Sanad was restarted while checking. Refresh this page and try again.</div>`);
    if (keyMsg) {
      const d = add(`<div class="err">${keyMsg} <a class="opt">Open settings</a></div>`);
      d.querySelector(".opt").onclick = () => send({ type: "SANAD_OPEN_OPTIONS" }, (res) => { if (!res?.ok) errorBox(res?.error || "Unknown error"); });
    } else add(`<div class="err">Something went wrong: ${esc(msg)}</div>`);
  }

  // draft: the answer while the model is still writing it, before the audit has checked the sources
  function cardHtml(r, draft) {
    const score = !draft && Number.isFinite(r.support_score) ? r.support_score : null;
    const srcs = (r.sources || []).map((s) => {
      const url = safeUrl(s.url);
      return `<div class="src">
        <div>${url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(s.title || url)}</a>` : `<b>${esc(s.title || "Source")}</b>`}
          ${draft ? `<span class="tag wait">checking…</span>` : `<span class="tag ${s.verified ? "ok" : "no"}">${s.verified ? "verified link" : "unverified"}</span>`}</div>
        ${s.locator ? `<div class="muted">${esc(s.locator)}</div>` : ""}
        ${s.grading ? `<div><b>Grading:</b> ${esc(s.grading)}</div>` : ""}
        ${s.excerpt_ar ? `<div class="ar" lang="ar">${esc(s.excerpt_ar)}</div>` : ""}
        ${s.excerpt_en ? `<div class="muted">“${esc(s.excerpt_en)}” <i>(explanatory translation)</i></div>` : ""}
      </div>`;
    }).join("");
    const a = r.audit || {};
    return `<div class="card${draft ? " draft" : ""}">
      ${r.verdict_label ? `<span class="badge ${esc(r.tone)}">${esc(r.verdict_label)}</span>` : ""}
      ${draft ? `<div class="note">Draft · Sanad is still checking the sources. The verdict can change.</div>` : ""}
      ${score !== null ? `<div class="meter"><span>Support from sources</span><div class="bar"><i style="width:${score}%"></i></div><b>${score}%</b></div>` : ""}
      ${r.claim_type ? `<div class="muted">Type: <b>${esc(r.claim_type)}</b>${r.content_level ? ` · Content level <b>${esc(r.content_level)}</b>` : ""}</div>` : ""}
      ${r.headline ? `<div class="headline">${esc(r.headline)}</div>` : ""}
      ${r.explanation ? `<div class="muted">${esc(r.explanation)}</div>` : ""}
      ${r.correction ? `<div class="box"><b>What the sources say</b>${esc(r.correction)}</div>` : ""}
      ${r.disagreement ? `<div class="box"><b>Differences between sources</b>${esc(r.disagreement)}</div>` : ""}
      ${r.referral ? `<div class="box"><b>Refer to</b>${esc(r.referral)}</div>` : ""}
      ${srcs ? `<div style="display:flex;flex-direction:column;gap:8px"><b style="font-size:12.5px">Sources</b>${srcs}</div>` : ""}
      ${r.caveats ? `<div class="muted"><i>${esc(r.caveats)}</i></div>` : ""}
      ${draft ? "" : `<details><summary>Audit · ${a.verified_sources ?? 0}/${a.listed_sources ?? 0} sources verified · ${a.searches?.length ?? 0} searches</summary>
        <ul>${(a.searches || []).map((q) => `<li>Searched: <span lang="ar">${esc(q)}</span></li>`).join("")}
        <li>${a.results_count ?? 0} results returned from approved domains</li>
        <li>Allowed domains: ${esc((a.domains || []).join(", "))}</li>
        ${(a.notes || []).map((n) => `<li><b>${esc(n)}</b></li>`).join("")}</ul></details>`}
    </div>`;
  }

  function renderResult(r) { add(cardHtml(r, false)); }

  function renderFollow(r) {
    const cites = (r.citations || []).map((c) => { const u = safeUrl(c.url); return u ? `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(c.title || u)}</a>` : ""; }).join("");
    add(`${esc(r.text || "No answer.")}${cites ? `<div class="cites"><b>Sources:</b>${cites}</div>` : ""}`, "bubble bot");
  }

  // The running check, shown as it happens: the searches with the pages they found, the answer
  // while it is being written, and a status line with a timer. The final answer replaces it.
  function liveBlock(label) {
    const d = add(`<div class="live"><div class="found"></div><div class="draft"></div>
      <div class="loading"><div class="spin"></div><span class="lt">${esc(label)}</span><span class="el"></span></div></div>`);
    const t0 = Date.now();
    const timer = setInterval(() => { d.querySelector(".el").textContent = `${Math.round((Date.now() - t0) / 1000)}s`; }, 1000);
    const update = (fn) => { const stay = nearBottom(); fn(); if (stay) scroll(); };
    current = {
      set: (text) => { d.querySelector(".lt").textContent = text; },
      search: (r) => update(() => {
        const pages = (r.results || []).slice(0, 3).map((p) => {
          const url = safeUrl(p.url);
          const site = url ? new URL(url).hostname.replace(/^www\./, "") : "";
          return `<div dir="auto">${url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(p.title || url)}</a>` : esc(p.title)} <span>· ${esc(site)}</span></div>`;
        }).join("");
        const n = r.results?.length || 0;
        const count = r.error ? "search failed" : n ? `${n} page${n > 1 ? "s" : ""}` : "nothing found";
        d.querySelector(".found").insertAdjacentHTML("beforeend",
          `<div class="hit"><span class="q" dir="auto">🔎 ${esc(r.query)}</span> · ${count}${pages ? `<div class="pages">${pages}</div>` : ""}</div>`);
      }),
      draft: (html) => update(() => { d.querySelector(".draft").innerHTML = html; d.querySelector(".lt").textContent = "Writing the answer…"; }),
      remove: () => { clearInterval(timer); d.remove(); current = null; },
    };
    return current;
  }

  function runVerify(text) {
    text = (text || "").trim();
    if (!text || busy) return;
    openPanel();
    add(`<div class="q">“${esc(text.length > 600 ? text.slice(0, 600) + "…" : text)}”</div>`, "bubble user");
    const l = liveBlock("Searching the approved sources…");
    setBusy(true);
    send({ type: "SANAD_VERIFY", text, pageUrl: location.href }, (res) => {
      l.remove(); setBusy(false);
      if (!res?.ok) return errorBox(res?.error || "Unknown error");
      hasCheck = true; renderResult(res.result);
    });
  }

  function runFollow(q) {
    if (!q || busy) return;
    add(esc(q), "bubble user");
    const l = liveBlock("Checking…");
    setBusy(true);
    send({ type: "SANAD_FOLLOWUP", question: q }, (res) => {
      l.remove(); setBusy(false);
      if (!res?.ok) return errorBox(res?.error || "Unknown error");
      renderFollow(res.result);
    });
  }

  // selection → floating button
  document.addEventListener("mouseup", (e) => {
    if (e.composedPath().includes(host)) return;
    setTimeout(() => {
      const sel = window.getSelection();
      const text = sel ? sel.toString().trim() : "";
      if (text.length < 8 || !sel.rangeCount) { fab.style.display = "none"; return; }
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      pendingText = text;
      fab.style.display = "inline-flex";
      const top = Math.min(window.innerHeight - 44, rect.bottom + 8);
      const left = Math.min(window.innerWidth - 190, Math.max(8, rect.left));
      fab.style.top = `${top}px`; fab.style.left = `${left}px`;
    }, 10);
  });
  document.addEventListener("mousedown", (e) => { if (!e.composedPath().includes(host)) fab.style.display = "none"; });

  fab.addEventListener("click", () => { fab.style.display = "none"; runVerify(pendingText); });
  root.querySelector(".close").onclick = closePanel;
  root.querySelector(".new").onclick = reset;
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const v = input.value.trim(); if (!v) return;
    input.value = "";
    // first message (or a long pasted passage) = a new verification; otherwise a follow-up question
    if (!hasCheck || v.length > 160) runVerify(v); else runFollow(v);
  });
  input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "SANAD_OPEN") { if (msg.text) runVerify(msg.text); else openPanel(); }
    if (msg.type === "SANAD_PROGRESS") current?.set(msg.text);
    if (msg.type === "SANAD_SEARCH") current?.search(msg);
    if (msg.type === "SANAD_DRAFT") current?.draft(msg.draft ? cardHtml(msg.draft, true) : `<div class="bubble bot draft">${esc(msg.text)}</div>`);
  });

  intro();
})();
