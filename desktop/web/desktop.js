// Fereastra InvoiceGuard Desktop: arată facturile din folderul urmărit, deja verificate de API.
// Panoul de detalii folosește aceleași stiluri (.ig-*) ca add-on-ul din browser.
(function () {
  const LABEL = { PLATESTE: 'Plătește', VERIFICA: 'Verifică', BLOCHEAZA: 'Blochează' };
  const CLS = { PLATESTE: 'ok', VERIFICA: 'warn', BLOCHEAZA: 'bad' };
  const ICON = { ok: '✓', galben: '!', rosu: '✕', na: '–' };
  const POLL_MS = 2000;

  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const lei = n => new Intl.NumberFormat('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + ' lei';
  const dataRo = s => (s ? s.slice(0, 10).split('-').reverse().join('.') : '');
  const dataOra = s => (s ? dataRo(s) + ', ' + s.slice(11, 16) : '');

  let items = [];
  let lastJson = '';
  const seen = new Set();
  let firstLoad = true;
  let approved = new Set();
  try { approved = new Set(JSON.parse(localStorage.getItem('igd.approved') || '[]')); } catch (_) {}
  const saveApproved = () => { try { localStorage.setItem('igd.approved', JSON.stringify([...approved])); } catch (_) {} };

  async function api(path, opts) {
    const r = await fetch(path, opts);
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body.detail || `Eroare ${r.status}`);
    return body;
  }

  const decisionOf = r => (r.decizie === 'VERIFICA' && approved.has(r.key) ? 'APROBAT' : r.decizie);
  const native = () => window.pywebview && window.pywebview.api;

  // ---------- Lista ----------
  async function refresh() {
    let data;
    try { data = await api('/api/inbox'); } catch (e) { $('igd-list').innerHTML = `<p class="igd-empty">Serverul nu răspunde.<br>${esc(e.message)}</p>`; return; }
    if (!data.activ) {
      $('igd-folder').textContent = '—';
      $('igd-list').innerHTML = '<p class="igd-empty">Urmărirea folderului e pornită doar în aplicația desktop.<br>Porniți-o cu <code>python -m desktop</code>.</p>';
      return;
    }
    $('igd-folder').textContent = data.folder;
    $('igd-folder').title = data.folder;
    const json = JSON.stringify(data.facturi);
    if (json === lastJson) return;
    lastJson = json;
    items = data.facturi;
    render();
  }

  function render() {
    const list = $('igd-list');
    if (!items.length) {
      list.innerHTML = '<p class="igd-empty">Nicio factură încă.<br>Salvați aici facturile descărcate din SPV sau trageți un XML în fereastră.</p>';
    } else {
      list.innerHTML = items.map(it => {
        const isNew = !firstLoad && !seen.has(it.fisier);
        seen.add(it.fisier);
        if (it.eroare) {
          return `<div class="igd-item d-EROARE ${isNew ? 'igd-new' : ''}"><div class="igd-row1"><span class="igd-name">${esc(it.fisier)}</span><span class="ig-badge ig-off">Necitit</span></div><div class="igd-why">${esc(it.eroare)}</div></div>`;
        }
        const r = it.rezultat, d = decisionOf(r);
        const badgeHtml = d === 'APROBAT'
          ? '<span class="ig-badge ig-approved">✓ Aprobat</span>'
          : `<span class="ig-badge ig-${CLS[d]}"><span class="ig-dot"></span>${LABEL[d]}</span>`;
        const why = r.motive.length ? r.motive.map(m => m.scurt).join(' · ') : 'Totul se potrivește';
        return `<button class="igd-item d-${d} ${isNew ? 'igd-new' : ''}" data-open="${esc(it.fisier)}">
          <div class="igd-row1"><span class="igd-name">${esc(r.furnizor)}</span>${badgeHtml}</div>
          <div class="igd-row2"><span>${esc(r.factura)} · primită ${dataOra(it.primit_la)}</span><span class="igd-amount">${lei(r.total)}</span></div>
          <div class="igd-why">${esc(why)}</div>
        </button>`;
      }).join('');
      items.forEach(it => seen.add(it.fisier));
    }
    firstLoad = false;
    renderStats();
  }

  function renderStats() {
    const rs = items.filter(i => i.rezultat).map(i => i.rezultat);
    const n = d => rs.filter(r => decisionOf(r) === d).length;
    const ok = n('PLATESTE') + n('APROBAT');
    $('igd-stats').innerHTML = `
      <span class="ig-stat ig-bad">${n('BLOCHEAZA')} de blocat</span>
      <span class="ig-stat ig-warn">${n('VERIFICA')} de verificat</span>
      <span class="ig-stat ig-ok">${ok} gata de plată</span>`;
    $('igd-export').textContent = `Exportă plăți aprobate (${ok})`;
  }

  // ---------- Panoul cu detalii (ca în add-on) ----------
  function anafSection(a) {
    if (!a) return '';
    if (a.status === 'unavailable') return '<h3>Date ANAF</h3><p class="ig-meta">ANAF nu a răspuns. Reîncercați.</p>';
    const head = a.status === 'simulat'
      ? '<h3>Date ANAF <span class="ig-sim">● SIMULAT</span></h3><p class="ig-meta">Firmă fictivă din scenariul de demo.</p>'
      : `<h3>Date ANAF <span class="ig-live">● LIVE</span></h3><p class="ig-meta">Interogat la ANAF pe ${dataOra(a.interogat_la)}</p>`;
    if (a.status === 'not_found') return head + '<p class="ig-anaf-nf">✕ CUI-ul nu există în registrul ANAF.</p>';
    const d = a.date;
    const yes = (v, good) => `<span class="${v === good ? 'ig-yes' : 'ig-no'}">${v ? 'Da' : 'Nu'}</span>`;
    return head + `<dl class="ig-dl">
      <dt>Denumire</dt><dd>${esc(d.denumire)}</dd>
      <dt>Înregistrată</dt><dd>${dataRo(d.data_inregistrare)}</dd>
      <dt>Plătitor TVA</dt><dd>${yes(d.tva, true)}</dd>
      <dt>Inactivă fiscal</dt><dd>${yes(d.inactiv, false)}</dd>
      <dt>Radiată</dt><dd>${yes(d.radiat, false)}</dd>
    </dl>`;
  }

  function openPanel(fisier) {
    const it = items.find(i => i.fisier === fisier);
    if (!it || !it.rezultat) return;
    const r = it.rezultat, d = decisionOf(r);
    closePanel();
    const back = document.createElement('div');
    back.className = 'ig-backdrop';
    back.innerHTML = `
      <aside class="ig-panel" role="dialog" aria-label="Verificare factură">
        <header class="ig-panel-head">
          <div>
            <div class="ig-kicker">◆ Fișier: ${esc(fisier)}</div>
            <h2>${esc(r.furnizor)}</h2>
            <div class="ig-meta">Factura <b>${esc(r.factura)}</b> · CUI ${esc(r.cui)} · ${lei(r.total)}</div>
          </div>
          <button class="ig-x" data-close aria-label="Închide">✕</button>
        </header>
        <div class="ig-verdict ig-${d === 'APROBAT' ? 'approved' : CLS[d]}">
          <div class="ig-verdict-label">${d === 'APROBAT' ? 'Aprobat manual' : LABEL[d]}</div>
          <div class="ig-risk"><span>Scor de risc</span><b>${r.scor_risc}</b>/100<div class="ig-bar"><i style="width:${r.scor_risc}%"></i></div></div>
        </div>
        <div class="ig-action"><b>Ce faceți:</b> ${esc(r.actiune_recomandata)}</div>
        <h3>Verificări</h3>
        <ul class="ig-checks">${r.verificari.map(c => `
          <li class="ig-c-${c.status}"><span class="ig-ic">${ICON[c.status]}</span>
            <div><b>${esc(c.titlu)}</b>${c.sursa ? `<span class="ig-src">${esc(c.sursa)}</span>` : ''}<p>${esc(c.detalii)}</p></div></li>`).join('')}
        </ul>
        ${anafSection(r.anaf)}
        <footer class="ig-panel-foot">
          ${r.decizie === 'VERIFICA' && !approved.has(r.key) ? `<button class="ig-btn ig-btn-primary" data-approve="${esc(fisier)}">Am verificat, aprobă plata</button>` : ''}
          ${approved.has(r.key) ? `<button class="ig-btn" data-unapprove="${esc(fisier)}">Anulează aprobarea</button>` : ''}
          <button class="ig-btn" data-close>Închide</button>
        </footer>
      </aside>`;
    document.body.appendChild(back);
    requestAnimationFrame(() => back.classList.add('ig-open'));
  }

  function closePanel() { document.querySelectorAll('.ig-backdrop').forEach(b => b.remove()); }

  function setApproval(fisier, on) {
    const r = items.find(i => i.fisier === fisier).rezultat;
    if (on) approved.add(r.key); else approved.delete(r.key);
    saveApproved();
    render();
    openPanel(fisier);
  }

  document.addEventListener('click', e => {
    const open = e.target.closest('[data-open]');
    if (open) { openPanel(open.dataset.open); return; }
    if (e.target.closest('[data-close]') || e.target.classList.contains('ig-backdrop')) { closePanel(); return; }
    const ap = e.target.closest('[data-approve]');
    if (ap) { setApproval(ap.dataset.approve, true); return; }
    const un = e.target.closest('[data-unapprove]');
    if (un) setApproval(un.dataset.unapprove, false);
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closePanel(); });

  // ---------- Trage-și-lasă / alege fișier ----------
  async function upload(files) {
    for (const f of files) {
      const fd = new FormData();
      fd.append('file', f);
      try { await api('/api/inbox/upload', { method: 'POST', body: fd }); }
      catch (e) { toast(`${f.name}: ${e.message}`); }
    }
    refresh();
  }

  let dragDepth = 0;
  document.addEventListener('dragenter', e => { e.preventDefault(); dragDepth++; document.body.classList.add('igd-dragging'); });
  document.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; document.body.classList.remove('igd-dragging'); } });
  document.addEventListener('dragover', e => e.preventDefault());
  document.addEventListener('drop', e => {
    e.preventDefault();
    dragDepth = 0;
    document.body.classList.remove('igd-dragging');
    if (e.dataTransfer && e.dataTransfer.files.length) upload([...e.dataTransfer.files]);
  });
  $('igd-pick').addEventListener('click', () => $('igd-file').click());
  $('igd-file').addEventListener('change', e => { upload([...e.target.files]); e.target.value = ''; });

  // ---------- Export ----------
  $('igd-export').addEventListener('click', async () => {
    const fisiere = items.filter(i => i.rezultat && ['PLATESTE', 'APROBAT'].includes(decisionOf(i.rezultat))).map(i => i.fisier);
    try {
      const r = await api('/api/inbox/export', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fisiere }) });
      toast(`Fișier de plăți salvat (${r.facturi} facturi): ${r.fisier}`);
      if (native()) window.pywebview.api.open_folder('plati');
    } catch (e) { toast(e.message); }
  });

  // ---------- Funcții native (doar în fereastra pywebview) ----------
  window.addEventListener('pywebviewready', () => {
    $('igd-pin').hidden = false;
    $('igd-pin').classList.add('on');
    $('igd-open-folder').hidden = false;
  });
  $('igd-pin').addEventListener('click', async () => {
    const on = await window.pywebview.api.toggle_on_top();
    $('igd-pin').classList.toggle('on', on);
  });
  $('igd-open-folder').addEventListener('click', () => window.pywebview.api.open_folder('facturi'));

  function toast(msg) {
    const t = document.createElement('div');
    t.className = 'ig-toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 5000);
  }

  refresh();
  setInterval(refresh, POLL_MS);
})();
