chrome.storage.local.get("apiKey").then((s) => { if (!s.apiKey) document.getElementById("warn").textContent = "Add your API key in Settings to start."; });
document.getElementById("opts").onclick = () => chrome.runtime.openOptionsPage();
document.getElementById("open").onclick = async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id != null) chrome.tabs.sendMessage(tab.id, { type: "SANAD_OPEN" }).catch(() => {
    document.getElementById("warn").textContent = "Sanad can't run on this page (browser pages are protected). Try a normal website.";
  });
  window.close();
};
