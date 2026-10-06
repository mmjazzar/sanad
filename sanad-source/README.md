# Sanad – Hadith & Seerah Source Checker (Chrome extension)

Select any text on a web page (English or Arabic) → **Verify with Sanad** → Sanad checks whether it is grounded in the challenge's approved sources and answers in a chat panel with:
- a verdict: Sourced · Has a basis (details vary) · Weak or fabricated · Contradicts the sources · No basis · General reflection · Out of scope · Not enough evidence
- support score, correction, differences between narrations
- sources with Arabic excerpt + explanatory English translation, hadith grading and grader
- an **audit**: searches run, results, and how many source links were verified
- follow-up questions in the same chat

## Install (developer mode)
1. Unzip `sanad-extension.zip`.
2. Chrome → `chrome://extensions` → turn on **Developer mode** → **Load unpacked** → choose the unzipped folder.
3. The settings page opens. Pick a provider, paste its key, Save:
   - **Anthropic (Claude)**: an Anthropic API key, model `claude-sonnet-4-6` (or a cheaper model such as `claude-haiku-4-5-20251001`).
   - **Novita (GLM)**: a Novita API key, model `zai-org/glm-5.3`, plus a [Tavily](https://app.tavily.com) search key (see below).
4. Open any article, select a sentence, click **Verify with Sanad** (or right-click → Verify with Sanad).

## How it stays grounded
- Search is restricted with `allowed_domains` to the approved package: dorar.net, shamela.ws, quranpedia.net, islamic-content.com, dawa.center. sunnah.com / quran.com can be enabled in settings, but are labelled as outside the package.
- The model must cite URLs from its search results. The extension then **audits** every listed source. A link is marked verified only if it appeared in the actual search results and is on an allowed domain.
- Any "sourced / weak / contradicts" verdict with **zero verified links** is downgraded to "Not enough evidence". A verdict given without any search is downgraded too.
- Fatwa / personal-case questions → "Out of scope" with referral (content level D).

## Live answers
Replies are streamed, so the panel shows each part as soon as it is ready: every search with the pages it found, then the answer while the model writes it (verdict and headline first). That answer is marked as a draft until it is complete; then the audit checks its sources and the final card replaces it, so the verdict can still change at that point. A reply is stopped if the provider sends nothing for 60 seconds, and a whole check after 4½ minutes.

## Providers without built-in web search (Novita / GLM)
Anthropic runs the web search on its own servers. Novita's Anthropic-compatible API accepts the request but ignores that tool, so the model would answer from memory (and the audit would downgrade every verdict). For these providers the extension runs the search itself:
- the model gets a normal `web_search` tool; when it calls it, the background worker searches Tavily with `include_domains` set to the approved sites, drops any off-list result, and sends the results back (up to "Max searches per check");
- the run is then rebuilt in Anthropic's web-search format (`toServerSearchShape` in `lib/core.js`), so the same audit applies: a source is verified only if it appeared in those search results.

GLM runs with thinking turned off: in live tests it gave the same verdicts and verified sources, 2–3× faster (a check takes about 30–60 seconds instead of 70–220). GLM sometimes announces a search and then stops, so the loop nudges it to continue (up to twice) before the audit takes over. Each Tavily search uses 2 credits (advanced depth).

## Tests
```
npm install                    # installs Playwright (for the e2e test)
npm test                       # 31 unit tests: request, parsing, anti-hallucination audit, client-side search, streaming
npm run test:e2e               # 27 checks: real extension in Chromium against a local streaming mock API (Anthropic + Novita/Tavily)
```
The tests use a mock API that reproduces the documented web-search response format. Run a live check with a real key before demo day.

## Notes for production
The API key is stored locally in the browser. That is fine for the demo, but a public release should send requests through a small backend that holds the key and adds rate limits.
