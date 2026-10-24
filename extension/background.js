// Partea de fundal a extensiei: trimite cererile add-on-ului către API-ul InvoiceGuard.
// O pagină https (ex. SAGA WEB) nu are voie să apeleze direct 127.0.0.1; extensia are,
// prin host_permissions din manifest.
const API = 'http://127.0.0.1:8000';

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.type !== 'ig-api' || typeof msg.path !== 'string' || !msg.path.startsWith('/api/')) return;
  (async () => {
    try {
      const init = { method: msg.method || 'GET' };
      if (msg.json) {
        init.headers = { 'Content-Type': 'application/json' };
        init.body = JSON.stringify(msg.json);
      }
      if (msg.file) {
        init.body = new FormData();
        init.body.append('file', new Blob([msg.file.text], { type: 'text/xml' }), msg.file.name);
      }
      const r = await fetch(API + msg.path, init);
      sendResponse({ ok: r.ok, status: r.status, body: await r.json().catch(() => ({})) });
    } catch (e) {
      sendResponse({ error: String(e) });
    }
  })();
  return true; // răspunsul vine asincron
});
