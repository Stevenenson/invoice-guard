// Fereastra din iconița extensiei: starea API-ului și diagnosticul paginii curente.
const $ = id => document.getElementById(id);

chrome.runtime.sendMessage({ type: 'ig-api', path: '/api/health' }, res => {
  const on = res && res.ok;
  $('dot').className = 'dot ' + (on ? 'on' : 'off');
  $('api-status').textContent = on ? 'API pornit (127.0.0.1:8000)' : 'API oprit';
  $('api-help').innerHTML = on
    ? 'Coloana „Verificare” apare automat în lista de facturi primite.'
    : 'Porniți serverul din folderul proiectului: <code>./run.sh</code>';
});

$('diag').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  let report;
  try {
    report = await chrome.tabs.sendMessage(tab.id, { type: 'ig-diagnostic' });
  } catch (_) {
    report = { eroare: 'Add-on-ul nu rulează pe această pagină. Deschideți SAGA WEB (web.sagasoft.ro) sau demo-ul și reîncărcați pagina.' };
  }
  $('out').hidden = false;
  $('copy').hidden = false;
  $('out').value = JSON.stringify(report, null, 2);
});

$('copy').addEventListener('click', () => {
  $('out').select();
  navigator.clipboard.writeText($('out').value);
  $('copy').textContent = 'Copiat';
});
