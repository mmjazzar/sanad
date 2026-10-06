import { DEFAULT_SETTINGS, PROVIDERS } from "./lib/core.js";
const ids = Object.keys(DEFAULT_SETTINGS);
const s = { ...DEFAULT_SETTINGS, ...(await chrome.storage.local.get(ids)) };
for (const k of ids) {
  const el = document.getElementById(k); if (!el) continue;
  if (el.type === "checkbox") el.checked = Boolean(s[k]); else el.value = s[k];
}

const HINTS = {
  anthropic: {
    provider: "Claude searches the approved sources with Anthropic's built-in web search.",
    model: "Any Claude model that supports the web search tool, e.g. <code>claude-sonnet-4-6</code> (default) or <code>claude-haiku-4-5-20251001</code> (cheaper).",
  },
  novita: {
    provider: "GLM via Novita's Anthropic-compatible API. Sanad runs the searches itself, so a Tavily key is needed too.",
    model: "A Novita model ID. Use <code>zai-org/glm-5.3</code> (default). Avoid <code>zai-org/glm-5.3-flash</code>: it always thinks before answering, which made a check take minutes in testing.",
  },
};
const provider = document.getElementById("provider");
function showProvider() {
  const p = provider.value;
  document.getElementById("providerHint").textContent = HINTS[p].provider;
  document.getElementById("modelHint").innerHTML = HINTS[p].model;
  document.getElementById("searchKeyBox").hidden = p === "anthropic";
}
provider.onchange = () => {
  // switching provider resets the endpoint and model to that provider's defaults
  document.getElementById("apiBase").value = PROVIDERS[provider.value].apiBase;
  document.getElementById("model").value = PROVIDERS[provider.value].model;
  showProvider();
};
showProvider();

document.getElementById("save").onclick = async () => {
  const out = {};
  for (const k of ids) {
    const el = document.getElementById(k); if (!el) continue;
    out[k] = el.type === "checkbox" ? el.checked : el.value.trim();
  }
  const defaults = PROVIDERS[out.provider] || PROVIDERS.anthropic;
  if (!out.model) out.model = defaults.model;
  if (!out.apiBase) out.apiBase = defaults.apiBase;
  if (!out.searchApiBase) out.searchApiBase = DEFAULT_SETTINGS.searchApiBase;
  out.maxSearches = Math.min(10, Math.max(1, parseInt(out.maxSearches, 10) || 5));
  await chrome.storage.local.set(out);
  const st = document.getElementById("status"); st.textContent = "Saved ✓"; setTimeout(() => (st.textContent = ""), 2000);
};
