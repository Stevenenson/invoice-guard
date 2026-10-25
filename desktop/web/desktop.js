// Fereastra InvoiceGuard Desktop: importul, lista verificată și detaliile, totul în aceeași fereastră, fără pop-up-uri.
// Pasul 1 (nicio factură): fereastra e doar locul de import. Pasul 2: filtre, listă cu detalii și exportul.
// Detaliile folosesc aceleași stiluri (.ig-*) ca add-on-ul din browser.
(function () {
  const TABS = [
    { id: 'toate', label: 'Toate', hint: 'toate facturile' },
    { id: 'BLOCHEAZA', label: 'Blocate', icon: '✕', hint: 'nu se plătesc' },
    { id: 'VERIFICA', label: 'De reverificat', icon: '!', hint: 'verifici, apoi aprobi' },
    { id: 'OK', label: 'Verificate', icon: '✓', hint: 'gata de plată' },
    { id: 'EROARE', label: 'Necitite', icon: '?', hint: 'fișiere greșite' },
  ];
  const BADGE = {
    BLOCHEAZA: '<span class="ig-badge ig-bad"><span class="ig-dot"></span>Blocată</span>',
    VERIFICA: '<span class="ig-badge ig-warn"><span class="ig-dot"></span>De reverificat</span>',
    PLATESTE: '<span class="ig-badge ig-ok"><span class="ig-dot"></span>Verificată</span>',
    APROBAT: '<span class="ig-badge ig-approved">✓ Aprobată de tine</span>',
    DEBLOCAT: '<span class="ig-badge ig-approved">✓ Deblocată de tine</span>',
    EROARE: '<span class="ig-badge ig-off">Necitită</span>',
  };
  const VERDICT = {
    BLOCHEAZA: ['✕', 'Nu plăti această factură', 'Are cel puțin o problemă gravă și nu intră în exportul pentru bancă.'],
    VERIFICA: ['!', 'Reverifică înainte de plată', 'Ceva nu se potrivește. Lămurește problemele de mai jos, apoi aprob-o.'],
    PLATESTE: ['✓', 'Poți plăti', 'Toate verificările au trecut. Intră în exportul pentru bancă.'],
    APROBAT: ['✓', 'Aprobată de tine', 'Ai reverificat-o. Intră în exportul pentru bancă.'],
    DEBLOCAT: ['✓', 'Deblocată de tine', 'Era blocată; ai lămurit problema și ai notat motivul. Intră în export.'],
  };
  const SEVERITY = { BLOCHEAZA: 0, VERIFICA: 1, EROARE: 2, DEBLOCAT: 3, APROBAT: 3, PLATESTE: 4 };
  const ICON = { ok: '✓', galben: '!', rosu: '✕', na: '–' };
  const POLL_MS = 2000;

  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const lei = n => new Intl.NumberFormat('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + ' lei';
  const dataRo = s => (s ? s.slice(0, 10).split('-').reverse().join('.') : '');
  const dataOra = s => (s ? dataRo(s) + ', ' + s.slice(11, 16) : '');
  // „1 factură”, „3 facturi”, „20 de facturi”
  const cate = (n, unu, multe) => (n === 1 ? `1 ${unu}` : `${n} ${n % 100 >= 20 || (n && n % 100 === 0) ? 'de ' : ''}${multe}`);
  const fold = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const wideMq = window.matchMedia('(min-width: 760px)');

  let items = [];
  let lastJson = '';
  const seen = new Set();
  let firstLoad = true;
  let filter = 'toate';
  let query = '';
  let selected = null;
  let showAll = false;
  let serverDown = false;
  let sesiune = null;
  let approved = new Set();
  try { approved = new Set(JSON.parse(localStorage.getItem('igd.approved') || '[]')); } catch (_) {}
  // Facturile blocate deblocate de contabil, cu motivul scris de el: {cheie: {motiv, la}}.
  let deblocate = {};
  try { deblocate = JSON.parse(localStorage.getItem('igd.deblocate') || '{}'); } catch (_) {}
  const saveApproved = () => {
    try {
      localStorage.setItem('igd.approved', JSON.stringify([...approved]));
      localStorage.setItem('igd.deblocate', JSON.stringify(deblocate));
    } catch (_) {}
  };
  const forget = key => { approved.delete(key); delete deblocate[key]; };

  async function api(path, opts) {
    const r = await fetch(path, opts);
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body.detail || `Eroare ${r.status}`);
    return body;
  }

  const decisionOf = it => {
    if (it.eroare) return 'EROARE';
    const r = it.rezultat;
    if (r.decizie === 'BLOCHEAZA' && deblocate[r.key]) return 'DEBLOCAT';
    return r.decizie === 'VERIFICA' && approved.has(r.key) ? 'APROBAT' : r.decizie;
  };
  const groupOf = it => ({ PLATESTE: 'OK', APROBAT: 'OK', DEBLOCAT: 'OK' }[decisionOf(it)] || decisionOf(it));
  const count = g => items.filter(i => groupOf(i) === g).length;
  const native = () => window.pywebview && window.pywebview.api;

  // Problemele primele, apoi cele mai noi.
  const sortItems = list => list.sort((a, b) => SEVERITY[decisionOf(a)] - SEVERITY[decisionOf(b)] || b.primit_la.localeCompare(a.primit_la));

  function visible() {
    const q = fold(query.trim());
    return items.filter(it => {
      if (filter !== 'toate' && groupOf(it) !== filter) return false;
      if (!q) return true;
      const r = it.rezultat || {};
      return fold([it.fisier, r.furnizor, r.factura, r.cui].join(' ')).includes(q);
    });
  }

  // ---------- Mesaje în fereastră (bandă sub antet, nu pop-up) ----------
  let noticeTimer = null;
  function notice(html, kind, hideAfterMs) {
    clearTimeout(noticeTimer);
    const n = $('igd-notice');
    n.className = `igd-notice n-${kind || 'info'}`;
    n.innerHTML = `<div>${html}</div><button class="igd-x" data-close-notice aria-label="Închide">✕</button>`;
    n.hidden = false;
    if (hideAfterMs) noticeTimer = setTimeout(() => { n.hidden = true; }, hideAfterMs);
  }
  const hideNotice = () => { $('igd-notice').hidden = true; };

  // ---------- Date ----------
  async function refresh() {
    let data;
    try { data = await api('/api/inbox'); } catch (e) {
      if (!serverDown) notice(`Serverul InvoiceGuard nu răspunde. Închideți fereastra și porniți din nou aplicația. <small>(${esc(e.message)})</small>`, 'bad');
      serverDown = true;
      return;
    }
    if (serverDown) { serverDown = false; hideNotice(); }
    if (!data.activ) {
      $('igd-folder').textContent = '—';
      notice('Urmărirea folderului e pornită doar în aplicația desktop. Porniți-o cu <code>python -m desktop</code>.', 'bad');
      return;
    }
    $('igd-folder').textContent = data.folder;
    $('igd-folder').title = data.folder;
    // Aplicația pornește cu lista goală, deci aprobările de data trecută nu mai au sens.
    if (data.sesiune !== sesiune) {
      let stored = null;
      try { stored = localStorage.getItem('igd.sesiune'); localStorage.setItem('igd.sesiune', data.sesiune); } catch (_) {}
      if (stored !== data.sesiune) { approved.clear(); deblocate = {}; saveApproved(); }
      sesiune = data.sesiune;
    }
    const json = JSON.stringify(data.facturi);
    if (json === lastJson) return;
    lastJson = json;
    items = sortItems(data.facturi);
    render();
  }

  // ---------- Afișare ----------
  function render() {
    const has = items.length > 0;
    $('igd-start').hidden = has;
    $('igd-work').hidden = !has;
    $('igd-add').hidden = !has;
    $('igd-clear').hidden = !has;
    if (has) {
      if (filter === 'EROARE' && !count('EROARE')) filter = 'toate';
      renderSummary();
      renderTabs();
      renderList();
      renderFoot();
    }
    items.forEach(it => seen.add(it.fisier));
    firstLoad = false;
  }

  function renderSummary() {
    const bad = count('BLOCHEAZA'), warn = count('VERIFICA'), err = count('EROARE');
    const need = bad + warn;
    const start = bad ? 'BLOCHEAZA' : warn ? 'VERIFICA' : null;
    const errTxt = err ? ` ${cate(err, 'fișier nu a putut fi citit', 'fișiere nu au putut fi citite')}.` : '';
    const el = $('igd-summary');
    el.className = `igd-summary ${need ? 's-warn' : 's-ok'}`;
    el.innerHTML = need
      ? `<span><b>${cate(need, 'factură are', 'facturi au')} nevoie de atenția ta.</b> Deschide-le pe rând: vezi ce nu se potrivește și ce ai de făcut.${errTxt}</span>
         ${filter !== start ? `<button class="ig-btn" data-filter="${start}">Începe cu cele ${start === 'BLOCHEAZA' ? 'blocate' : 'de reverificat'} →</button>` : ''}`
      : `<span><b>Nicio factură cu probleme.</b> Poți exporta plățile pentru bancă, din butonul de jos.${errTxt}</span>`;
  }

  function renderTabs() {
    $('igd-tabs').innerHTML = TABS.map(t => {
      const n = t.id === 'toate' ? items.length : count(t.id);
      if (t.id === 'EROARE' && !n) return '';
      return `<button class="igd-tab t-${t.id} ${filter === t.id ? 'on' : ''}" role="tab" aria-selected="${filter === t.id}" data-filter="${t.id}">
        <b>${t.icon ? `<span class="igd-tab-ic">${t.icon}</span>` : ''}${t.label}<span class="igd-count">${n}</span></b>
        <small>${t.hint}</small>
      </button>`;
    }).join('');
  }

  function renderList() {
    const list = visible();
    const wide = wideMq.matches;
    // În fereastra lată, panoul din dreapta arată mereu o factură: prima din filtru, dacă nu e aleasă alta.
    if (wide && !list.some(i => i.fisier === selected)) selected = list.length ? list[0].fisier : null;
    $('igd-list').innerHTML = list.length
      ? list.map(it => cardHtml(it) + (!wide && it.fisier === selected ? `<div class="igd-inline">${detailHtml(it)}</div>` : '')).join('')
      : `<p class="igd-empty">${emptyText()}</p>`;
    const cur = items.find(i => i.fisier === selected);
    $('igd-detail').innerHTML = !wide ? '' : cur ? detailHtml(cur) : '<p class="igd-empty">Alege o factură din listă ca să vezi ce verificări are.</p>';
  }

  function emptyText() {
    if (query.trim()) return `Nicio factură nu se potrivește cu „${esc(query.trim())}”.`;
    return {
      BLOCHEAZA: 'Nicio factură blocată. 👍',
      VERIFICA: 'Nu mai e nimic de reverificat. 👍',
      OK: 'Încă nu e nicio factură verificată.<br>Facturile de reverificat ajung aici după ce le aprobi.',
    }[filter] || 'Nicio factură aici.';
  }

  function cardHtml(it) {
    const d = decisionOf(it);
    const cls = `igd-item d-${d}${it.fisier === selected ? ' igd-sel' : ''}${!firstLoad && !seen.has(it.fisier) ? ' igd-new' : ''}`;
    const attrs = `class="${cls}" data-sel="${esc(it.fisier)}" aria-expanded="${it.fisier === selected}"`;
    if (d === 'EROARE') {
      return `<button ${attrs}><div class="igd-row1"><span class="igd-name">${esc(it.fisier)}</span>${BADGE.EROARE}</div><div class="igd-why">${esc(it.eroare)}</div></button>`;
    }
    const r = it.rezultat;
    const why = r.motive.length ? r.motive.map(m => m.scurt).join(' · ') : 'Totul se potrivește';
    const whyCls = { BLOCHEAZA: 'w-bad', VERIFICA: 'w-warn' }[d] || '';
    return `<button ${attrs}>
      <div class="igd-row1"><span class="igd-name">${esc(r.furnizor)}</span>${BADGE[d]}</div>
      <div class="igd-row2"><span>${esc(r.factura)} · primită ${dataOra(it.primit_la)}</span><span class="igd-amount">${lei(r.total)}</span></div>
      <div class="igd-why ${whyCls}">${esc(why)}</div>
    </button>`;
  }

  function checksHtml(list) {
    return `<ul class="ig-checks">${list.map(c => `
      <li class="ig-c-${c.status}"><span class="ig-ic">${ICON[c.status]}</span>
        <div><b>${esc(c.titlu)}</b>${c.sursa ? `<span class="ig-src">${esc(c.sursa)}</span>` : ''}<p>${esc(c.detalii)}</p></div></li>`).join('')}
    </ul>`;
  }

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

  // Ordinea e cea în care lucrează contabilul: verdictul, ce nu se potrivește, ce face acum.
  function detailHtml(it) {
    const d = decisionOf(it);
    const f = esc(it.fisier);
    if (d === 'EROARE') {
      return `<div class="igd-d-head"><h2>${f}</h2></div>
        <div class="igd-verdict v-EROARE"><span class="igd-v-ic">?</span><div><b>Fișierul nu a putut fi citit</b><span>${esc(it.eroare)}</span></div></div>
        <div class="igd-next"><b>Ce faci acum</b><p>Verifică dacă ai tras XML-ul facturii din SPV (nu PDF-ul sau fișierul cu semnătura).
        Cel mai sigur: descarcă din nou arhiva ZIP din SPV și trage-o în fereastră.</p></div>
        ${fileRow(it)}`;
    }
    const r = it.rezultat;
    const [ic, title] = VERDICT[d];
    const sub = d === 'DEBLOCAT' ? `Motivul tău: „${esc(deblocate[r.key].motiv)}” (${dataOra(deblocate[r.key].la)})` : VERDICT[d][2];
    const probleme = r.verificari.filter(c => c.status === 'rosu' || c.status === 'galben');
    const actions = d === 'VERIFICA'
      ? `<button class="ig-btn ig-btn-primary" data-approve="${f}">✓ Am verificat, aprob plata</button>
         <small>După aprobare, factura trece la „Verificate” și intră în exportul pentru bancă.</small>`
      : d === 'APROBAT' ? `<button class="ig-btn" data-unapprove="${f}">Anulează aprobarea</button>`
      : d === 'DEBLOCAT' ? `<button class="ig-btn" data-unapprove="${f}">Anulează deblocarea</button>`
      // Deblocarea e intenționat mai ascunsă și cere un motiv scris: o factură roșie nu se plătește din reflex.
      : d === 'BLOCHEAZA' ? `<details class="igd-override">
          <summary>Am lămurit problema: deblochez factura</summary>
          <p>Doar dacă ai verificat în afara aplicației, de exemplu ai sunat furnizorul la numărul din contract. Scrie ce ai verificat:</p>
          <textarea class="igd-motiv" rows="2" placeholder="Ex.: am sunat la numărul din contract, contul nou e confirmat de dl. Popescu"></textarea>
          <button class="ig-btn igd-danger" data-unblock="${f}" disabled>Deblochează și aprobă plata</button>
        </details>` : '';
    return `<div class="igd-d-head">
        <h2>${esc(r.furnizor)}</h2>
        <div class="ig-meta">Factura <b>${esc(r.factura)}</b> · CUI ${esc(r.cui)} · <b>${lei(r.total)}</b></div>
      </div>
      <div class="igd-verdict v-${d}">
        <span class="igd-v-ic">${ic}</span>
        <div><b>${title}</b><span>${sub}</span></div>
        <div class="igd-risk">risc<br><b>${r.scor_risc}</b>/100</div>
      </div>
      ${probleme.length
        ? `<div class="igd-sec">Ce nu se potrivește (${probleme.length})</div>${checksHtml(probleme)}`
        : '<p class="igd-allgood">✓ Totul se potrivește: SPV, IBAN, ANAF, contract și istoricul plăților.</p>'}
      ${d === 'PLATESTE' ? '' : `<div class="igd-next"><b>Ce faci acum</b><p>${esc(r.actiune_recomandata)}</p>${actions ? `<div class="igd-actions">${actions}</div>` : ''}</div>`}
      <details class="igd-more" ${showAll ? 'open' : ''}>
        <summary>Toate verificările (${r.verificari.length}) și datele ANAF</summary>
        ${checksHtml(r.verificari)}
        ${anafSection(r.anaf)}
      </details>
      ${fileRow(it)}`;
  }

  const fileRow = it => `<div class="igd-file">
      <span>Fișier: ${esc(it.fisier)} · primit ${dataOra(it.primit_la)}</span>
      <button class="igd-del" data-del="${esc(it.fisier)}">🗑 Șterge din listă</button>
    </div>`;

  function renderFoot() {
    const ready = items.filter(i => groupOf(i) === 'OK');
    const total = ready.reduce((s, i) => s + (i.rezultat.total || 0), 0);
    const bad = count('BLOCHEAZA'), warn = count('VERIFICA');
    const left = [bad && `${bad} ${bad === 1 ? 'blocată' : 'blocate'}`, warn && `${warn} de reverificat`].filter(Boolean).join(' și ');
    $('igd-foot-info').innerHTML = ready.length
      ? `<b>${cate(ready.length, 'factură verificată', 'facturi verificate')}</b> · ${lei(total)}${left ? `<br>Nu intră în export: ${left}.` : ''}`
      : 'Nicio factură verificată încă. Aprobă facturile de reverificat ca să le poți exporta.';
    $('igd-export').disabled = $('igd-csv').disabled = !ready.length;
    $('igd-export').textContent = ready.length ? `Exportă facturile verificate (${ready.length})` : 'Exportă facturile verificate';
  }

  function select(fisier) {
    // În fereastra îngustă, un al doilea clic pe aceeași factură o închide.
    selected = !wideMq.matches && selected === fisier ? null : fisier;
    renderList();
    const card = document.querySelector('.igd-item.igd-sel');
    // În fereastra îngustă, factura urcă sus ca să se vadă și detaliile de sub ea.
    if (card) { card.focus({ preventScroll: true }); card.scrollIntoView({ block: wideMq.matches ? 'nearest' : 'start' }); }
  }

  function setApproval(fisier, on, motiv) {
    const r = items.find(i => i.fisier === fisier).rezultat;
    // După aprobare trecem direct la următoarea factură din același filtru.
    const before = visible();
    const next = before[before.findIndex(i => i.fisier === fisier) + 1];
    if (!on) forget(r.key);
    // Ora locală (nu UTC), în formatul folosit peste tot în pagină.
    else if (r.decizie === 'BLOCHEAZA') deblocate[r.key] = { motiv, la: new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 19) };
    else approved.add(r.key);
    saveApproved();
    sortItems(items);
    if (on && (filter === 'VERIFICA' || filter === 'BLOCHEAZA')) selected = next ? next.fisier : null;
    render();
    if (on) notice(`Ai ${r.decizie === 'BLOCHEAZA' ? 'deblocat' : 'aprobat'} factura ${esc(r.factura)} de la ${esc(r.furnizor)}. A trecut la „Verificate”.`, 'ok', 5000);
  }

  // ---------- Ștergere: fișierele se mută în folderul „Sterse”, nu se pierd ----------
  const sterseLink = () => (native() ? ' <button class="igd-link" data-open-sterse>Deschide folderul Sterse</button>' : '');

  async function removeOne(fisier) {
    const it = items.find(i => i.fisier === fisier);
    const before = visible();
    const i = before.findIndex(x => x.fisier === fisier);
    const next = before[i + 1] || before[i - 1];
    try { await api(`/api/inbox/${encodeURIComponent(fisier)}`, { method: 'DELETE' }); } catch (e) { notice(esc(e.message), 'bad'); return; }
    // Dacă aceeași factură e încărcată din nou, se verifică de la zero.
    if (it && it.rezultat) { forget(it.rezultat.key); saveApproved(); }
    selected = next ? next.fisier : null;
    lastJson = '';
    await refresh();
    const nume = it && it.rezultat ? `factura ${esc(it.rezultat.factura)} de la ${esc(it.rezultat.furnizor)}` : esc(fisier);
    notice(`Am șters ${nume} din listă. Fișierul e mutat în folderul Sterse.${sterseLink()}`, 'ok', 6000);
  }

  function confirmClear() {
    notice(`<b>Ștergi toate cele ${cate(items.length, 'factură', 'facturi')} din listă?</b> Fișierele se mută în folderul Sterse, iar aprobările tale se resetează.
      <div class="igd-notice-btns"><button class="ig-btn igd-danger" data-clear-confirm>Da, șterge toate</button><button class="ig-btn" data-close-notice>Anulează</button></div>`, 'bad');
  }

  async function clearAll() {
    let r;
    try { r = await api('/api/inbox', { method: 'DELETE' }); } catch (e) { notice(esc(e.message), 'bad'); return; }
    approved.clear();
    deblocate = {};
    saveApproved();
    filter = 'toate';
    query = '';
    $('igd-search').value = '';
    selected = null;
    lastJson = '';
    await refresh();
    notice(`Am șters ${cate(r.sterse, 'factură', 'facturi')}. Poți încărca altele.${sterseLink()}`, 'ok', 8000);
  }

  function setFilter(f) {
    filter = f;
    render();
  }

  // ---------- Clicuri ----------
  document.addEventListener('click', e => {
    const t = e.target;
    const el = sel => t.closest(sel);
    if (el('[data-close-notice]')) { hideNotice(); return; }
    if (el('[data-clear-confirm]')) { clearAll(); return; }
    if (el('[data-open-sterse]')) { window.pywebview.api.open_folder('sterse'); return; }
    if (el('[data-del]')) { removeOne(el('[data-del]').dataset.del); return; }
    if (el('[data-filter]')) { setFilter(el('[data-filter]').dataset.filter); return; }
    if (el('[data-approve]')) { setApproval(el('[data-approve]').dataset.approve, true); return; }
    if (el('[data-unapprove]')) { setApproval(el('[data-unapprove]').dataset.unapprove, false); return; }
    if (el('[data-unblock]')) {
      const motiv = el('.igd-override').querySelector('.igd-motiv').value.trim();
      setApproval(el('[data-unblock]').dataset.unblock, true, motiv);
      return;
    }
    if (el('[data-sel]')) select(el('[data-sel]').dataset.sel);
  });
  // Butonul de deblocare se activează doar după un motiv de cel puțin 10 caractere.
  document.addEventListener('input', e => {
    if (!e.target.classList.contains('igd-motiv')) return;
    e.target.closest('.igd-override').querySelector('[data-unblock]').disabled = e.target.value.trim().length < 10;
  });
  document.addEventListener('toggle', e => { if (e.target.classList && e.target.classList.contains('igd-more')) showAll = e.target.open; }, true);

  // Săgețile sus/jos trec prin facturi.
  $('igd-list').addEventListener('keydown', e => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const list = visible();
    const i = list.findIndex(it => it.fisier === selected);
    const next = list[Math.max(0, Math.min(list.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))];
    if (next) { e.preventDefault(); selected = null; select(next.fisier); }
  });

  $('igd-search').addEventListener('input', e => { query = e.target.value; renderList(); });
  wideMq.addEventListener('change', () => { if (items.length) renderList(); });

  // ---------- Import: trage-și-lasă oriunde sau alege fișierele ----------
  async function upload(files) {
    if (!files.length) return;
    notice(`Se verifică ${cate(files.length, 'fișier', 'fișiere')}…`, 'info');
    const errors = [];
    let ok = 0;
    for (const f of files) {
      const fd = new FormData();
      fd.append('file', f);
      try { await api('/api/inbox/upload', { method: 'POST', body: fd }); ok++; }
      catch (e) { errors.push(`<li><b>${esc(f.name)}</b>: ${esc(e.message)}</li>`); }
    }
    afterImport(ok, errors);
  }

  async function afterImport(ok, errors) {
    filter = 'toate';
    query = '';
    $('igd-search').value = '';
    lastJson = '';  // redesenează chiar dacă lista n-a apărut încă, ca filtrul resetat să se vadă
    await refresh();
    if (errors.length) {
      notice(`${ok ? `Am adăugat ${cate(ok, 'factură', 'facturi')}. ` : ''}Nu am putut adăuga:<ul>${errors.join('')}</ul>`, 'bad');
    } else {
      notice(`Am verificat ${cate(ok, 'factură', 'facturi')}. Cele cu probleme sunt primele în listă.`, 'ok', 6000);
    }
  }

  // În aplicația desktop folosim dialogul sistemului: cel din pagină ar rămâne sub fereastra „mereu deasupra”.
  async function pick() {
    if (!native()) { $('igd-file').click(); return; }
    let res;
    try { res = await window.pywebview.api.import_files(); } catch (e) { notice(esc(e.message || e), 'bad'); return; }
    if (!res || !res.length) return;
    afterImport(res.filter(r => !r.eroare).length, res.filter(r => r.eroare).map(r => `<li><b>${esc(r.nume)}</b>: ${esc(r.eroare)}</li>`));
  }
  $('igd-drop').addEventListener('click', pick);
  $('igd-drop').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
  $('igd-add').addEventListener('click', pick);
  $('igd-clear').addEventListener('click', confirmClear);
  $('igd-file').addEventListener('change', e => { upload([...e.target.files]); e.target.value = ''; });

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

  // ---------- Export ----------
  const verificate = () => items.filter(i => groupOf(i) === 'OK').map(i => i.fisier);

  // Facturile pentru SAGA: contabilul alege folderul, fiecare factură se salvează exact cum a fost importată.
  $('igd-export').addEventListener('click', async () => {
    if (!native()) { notice('Exportul facturilor merge doar în aplicația desktop (dublu-click pe „InvoiceGuard Desktop”).', 'bad'); return; }
    let r;
    const deblocateNume = items.filter(i => decisionOf(i) === 'DEBLOCAT').map(i => i.fisier);
    try { r = await window.pywebview.api.export_invoices(verificate(), deblocateNume); } catch (e) { notice(esc(e.message || e), 'bad'); return; }
    if (r.anulat) return;
    notice(r.salvate
      ? `Am salvat ${cate(r.salvate, 'factură verificată', 'facturi verificate')} în <code>${esc(r.folder)}</code>, fiecare exact cum a fost importată. De acolo le imporți în SAGA.`
      : 'Nicio factură verificată de salvat.', r.salvate ? 'ok' : 'bad');
  });

  // Fișierul de plăți pentru banca online (CSV), ca înainte.
  $('igd-csv').addEventListener('click', async () => {
    const fisiere = verificate();
    try {
      const r = await api('/api/inbox/export', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fisiere }) });
      notice(`Fișierul de plăți e salvat (${cate(r.facturi, 'factură', 'facturi')}). Îl încarci în banca online: <code>${esc(r.fisier)}</code>`, 'ok');
      if (native()) window.pywebview.api.open_folder('plati');
    } catch (e) { notice(esc(e.message), 'bad'); }
  });

  // ---------- Funcții native (doar în fereastra pywebview) ----------
  window.addEventListener('pywebviewready', async () => {
    $('igd-pin').hidden = false;
    $('igd-pin').classList.toggle('on', await window.pywebview.api.is_on_top());
    $('igd-open-folder').hidden = false;
  });
  $('igd-pin').addEventListener('click', async () => {
    const on = await window.pywebview.api.toggle_on_top();
    $('igd-pin').classList.toggle('on', on);
  });
  $('igd-open-folder').addEventListener('click', () => window.pywebview.api.open_folder('facturi'));

  refresh();
  setInterval(refresh, POLL_MS);
})();
