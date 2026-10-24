// Add-on „InvoiceGuard”: citește tabelul de facturi din pagină (ca o extensie Chrome),
// cere verificarea fiecărei facturi și adaugă coloana „Verificare”.
// Nu depinde de codul paginii: doar de DOM, prin selectorii din CFG.
(function () {
  if (document.documentElement.dataset.igLoaded) return;
  document.documentElement.dataset.igLoaded = '1';

  const CFG = {
    table: 'table.inv-table',
    headers: { nr: 'Nr. factură', furnizor: 'Furnizor', cui: 'CIF', total: 'Total', stare: 'Stare' },
    insertBefore: 'Acțiuni',
    payButton: '[data-action="pay"]',
  };
  const LABEL = { PLATESTE: 'Plătește', VERIFICA: 'Verifică', BLOCHEAZA: 'Blochează' };
  const CLS = { PLATESTE: 'ok', VERIFICA: 'warn', BLOCHEAZA: 'bad' };
  const ICON = { ok: '✓', galben: '!', rosu: '✕', na: '–' };

  const results = new Map();
  const pending = new Set();
  let approved = new Set();
  try { approved = new Set(JSON.parse(localStorage.getItem('ig.approved') || '[]')); } catch (_) {}
  const saveApproved = () => { try { localStorage.setItem('ig.approved', JSON.stringify([...approved])); } catch (_) {} };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const lei = n => window.IG.lei(n);

  const own = el => el.classList.contains('ig-cell');
  const pageCells = row => [...row.cells].filter(c => !own(c));
  const text = el => (el ? el.textContent.trim() : '');

  function columns(table) {
    const ths = pageCells(table.tHead.rows[0]).map(text);
    const idx = {};
    for (const [k, label] of Object.entries(CFG.headers)) idx[k] = ths.indexOf(label);
    idx.insert = ths.indexOf(CFG.insertBefore);
    return idx;
  }

  function readRow(row, idx) {
    const c = pageCells(row);
    return {
      nr: text(c[idx.nr]),
      furnizor: text(c[idx.furnizor]),
      cui: text(c[idx.cui]).replace(/^RO/i, ''),
      total: parseFloat(text(c[idx.total]).replace(/[^\d,]/g, '').replace(',', '.')),
      platita: /plătit/i.test(text(c[idx.stare])) && !/neplătit/i.test(text(c[idx.stare])),
    };
  }

  function decisionOf(r) {
    if (r.decizie === 'VERIFICA' && approved.has(r.key)) return 'APROBAT';
    return r.decizie;
  }

  function badge(r) {
    const d = decisionOf(r);
    if (d === 'APROBAT') return `<span class="ig-badge ig-approved">✓ Aprobat manual</span>`;
    const first = r.motive[0];
    const extra = r.motive.length > 1 ? ` <span class="ig-more">+${r.motive.length - 1}</span>` : '';
    return `<span class="ig-badge ig-${CLS[d]}"><span class="ig-dot"></span>${LABEL[d]}</span>` +
      (first ? `<span class="ig-reason">${esc(first.scurt)}${extra}</span>` : '');
  }

  function paintCell(td, key) {
    const r = results.get(key);
    if (td.dataset.paid) { td.innerHTML = '<span class="ig-muted">—</span>'; return; }
    td.innerHTML = r ? `<button class="ig-cell-btn" data-ig-open="${esc(key)}">${badge(r)}</button>`
      : '<span class="ig-loading"><span class="ig-spin"></span>Se verifică…</span>';
  }

  function enhance() {
    const table = document.querySelector(CFG.table);
    if (!table || !table.tHead) return;
    const idx = columns(table);
    if (idx.nr < 0 || idx.cui < 0) return;
    ensureToolbar(table);

    const headRow = table.tHead.rows[0];
    if (!headRow.querySelector('.ig-cell')) {
      const th = document.createElement('th');
      th.className = 'ig-cell ig-th';
      th.innerHTML = '<span class="ig-th-mark">◆</span> Verificare';
      headRow.insertBefore(th, pageCells(headRow)[idx.insert] || null);
    }

    let changed = false;
    for (const row of table.tBodies[0].rows) {
      if (row.querySelector('.ig-cell')) continue;
      changed = true;
      const inv = readRow(row, idx);
      const key = inv.cui + '|' + inv.nr;
      const td = document.createElement('td');
      td.className = 'ig-cell';
      td.dataset.key = key;
      if (inv.platita) td.dataset.paid = '1';
      row.dataset.igKey = key;
      row.insertBefore(td, pageCells(row)[idx.insert] || null);
      paintCell(td, key);
      if (!inv.platita && !results.has(key) && !pending.has(key)) {
        pending.add(key);
        window.IG_API.verify(inv).then(r => {
          pending.delete(key);
          results.set(key, r);
          repaint(key);
        });
      }
    }
    // Doar când am adăugat ceva, altfel propriile modificări ar re-declanșa observer-ul la nesfârșit.
    if (changed) updateToolbar();
  }

  function repaint(key) {
    document.querySelectorAll('td.ig-cell').forEach(td => { if (td.dataset.key === key) paintCell(td, key); });
    updateToolbar();
  }

  // ---------- Bara add-on-ului de deasupra tabelului ----------
  function ensureToolbar(table) {
    if (document.querySelector('.ig-toolbar')) return;
    const bar = document.createElement('div');
    bar.className = 'ig-toolbar';
    bar.innerHTML = `
      <div class="ig-brand"><span class="ig-logo">◆</span> InvoiceGuard <span class="ig-sub">verifică facturile față de contract, SPV și ANAF</span></div>
      <div class="ig-stats" id="ig-stats"></div>
      <button class="ig-btn ig-btn-primary" id="ig-export">⇩ Exportă plăți aprobate</button>`;
    const card = table.closest('.card') || table.parentElement;
    card.parentElement.insertBefore(bar, card);
    bar.querySelector('#ig-export').addEventListener('click', exportPayments);
  }

  function unpaidResults() {
    const keys = new Set([...document.querySelectorAll('td.ig-cell[data-key]:not([data-paid])')].map(td => td.dataset.key));
    return [...results.values()].filter(r => keys.has(r.key));
  }

  function updateToolbar() {
    const el = document.getElementById('ig-stats');
    if (!el) return;
    const rs = unpaidResults();
    const n = d => rs.filter(r => decisionOf(r) === d).length;
    const ok = n('PLATESTE') + n('APROBAT');
    const waiting = pending.size ? `<span class="ig-stat"><span class="ig-spin"></span>${pending.size} în verificare</span>` : '';
    el.innerHTML = `
      <span class="ig-stat ig-bad">${n('BLOCHEAZA')} de blocat</span>
      <span class="ig-stat ig-warn">${n('VERIFICA')} de verificat</span>
      <span class="ig-stat ig-ok">${ok} gata de plată</span>${waiting}`;
    document.getElementById('ig-export').textContent = `⇩ Exportă plăți aprobate (${ok})`;
  }

  function exportPayments() {
    const rs = unpaidResults().filter(r => ['PLATESTE', 'APROBAT'].includes(decisionOf(r)));
    if (!rs.length) { toast('Nicio factură aprobată pentru plată.'); return; }
    const lines = [['Beneficiar', 'CUI', 'IBAN', 'Suma', 'Moneda', 'Detalii plata']];
    for (const r of rs) {
      lines.push([r.furnizor, r.cui, r.ibanPlata || r.iban, r.total.toFixed(2), 'RON', `Contravaloare factura ${r.factura}`]);
    }
    const csv = '﻿' + lines.map(l => l.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `plati-aprobate-${window.IG_DATA.azi}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    const blocked = unpaidResults().length - rs.length;
    toast(`Fișier de plăți generat: ${rs.length} facturi. ${blocked} rămân blocate/în verificare. IBAN-urile sunt cele din contract.`);
  }

  // ---------- Panoul cu detalii ----------
  function openPanel(key) {
    const r = results.get(key);
    if (!r) return;
    closePanel();
    const d = decisionOf(r);
    const cls = d === 'APROBAT' ? 'approved' : CLS[d];
    const back = document.createElement('div');
    back.className = 'ig-backdrop';
    back.innerHTML = `
      <aside class="ig-panel" role="dialog" aria-label="Verificare factură">
        <header class="ig-panel-head">
          <div>
            <div class="ig-kicker">◆ InvoiceGuard · Verificare factură</div>
            <h2>${esc(r.furnizor)}</h2>
            <div class="ig-meta">Factura <b>${esc(r.factura)}</b> · CUI ${esc(r.cui)} · ${lei(r.total)} · primită prin ${esc(r.sursa)}</div>
          </div>
          <button class="ig-x" data-ig-close aria-label="Închide">✕</button>
        </header>
        <div class="ig-verdict ig-${cls}">
          <div class="ig-verdict-label">${d === 'APROBAT' ? 'Aprobat manual' : LABEL[d]}</div>
          <div class="ig-risk"><span>Scor de risc</span><b>${r.scor_risc}</b>/100
            <div class="ig-bar"><i style="width:${r.scor_risc}%"></i></div></div>
        </div>
        <div class="ig-action"><b>Ce faceți:</b> ${esc(r.actiune_recomandata)}</div>
        <h3>Verificări</h3>
        <ul class="ig-checks">
          ${r.verificari.map(c => `
            <li class="ig-c-${c.status}"><span class="ig-ic">${ICON[c.status]}</span>
              <div><b>${esc(c.titlu)}</b><p>${esc(c.detalii)}</p></div></li>`).join('')}
        </ul>
        ${r.contract ? `
          <h3>Din contract</h3>
          <dl class="ig-dl">
            <dt>Contract</dt><dd>${esc(r.contract.nr)} din ${window.IG.dataRo(r.contract.data)}</dd>
            <dt>IBAN contract</dt><dd class="ig-mono">${esc(r.contract.iban)}</dd>
            <dt>IBAN factură</dt><dd class="ig-mono ${r.iban && r.iban !== r.contract.iban ? 'ig-diff' : ''}">${esc(r.iban || '—')}</dd>
            <dt>Contact</dt><dd>${esc(r.contract.persoana)} · ${esc(r.contract.telefon)}</dd>
          </dl>` : ''}
        <footer class="ig-panel-foot">
          ${r.decizie === 'VERIFICA' && !approved.has(key) ? `<button class="ig-btn ig-btn-primary" data-ig-approve="${esc(key)}">Am verificat, aprobă plata</button>` : ''}
          ${approved.has(key) ? `<button class="ig-btn" data-ig-unapprove="${esc(key)}">Anulează aprobarea</button>` : ''}
          <button class="ig-btn" data-ig-json="${esc(key)}">Vezi răspunsul API</button>
          <button class="ig-btn" data-ig-close>Închide</button>
        </footer>
        <pre class="ig-json" hidden></pre>
      </aside>`;
    document.body.appendChild(back);
    requestAnimationFrame(() => back.classList.add('ig-open'));
  }

  function closePanel() { document.querySelectorAll('.ig-backdrop').forEach(b => b.remove()); }

  function apiView(r) {
    const { key, contract, linii, verificari, ibanPlata, ...rest } = r;
    return JSON.stringify({ ...rest, motive: r.motive.map(({ nivel, text }) => ({ nivel, text })) }, null, 2);
  }

  // ---------- Blocarea plății în pagina gazdă ----------
  let allowOnce = null;
  document.addEventListener('click', e => {
    const pay = e.target.closest(CFG.payButton);
    if (pay) {
      const row = pay.closest('tr');
      const key = row && row.dataset.igKey;
      if (!key || allowOnce === pay) { allowOnce = null; return; }
      const r = results.get(key);
      const d = r ? decisionOf(r) : 'PENDING';
      if (d === 'PLATESTE' || d === 'APROBAT') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (d === 'PENDING') { toast('Verificarea facturii e în curs. Încercați din nou în câteva secunde.'); return; }
      payGuard(r, pay);
      return;
    }
    const open = e.target.closest('[data-ig-open]');
    if (open) { openPanel(open.dataset.igOpen); return; }
    if (e.target.closest('[data-ig-close]') || e.target.classList.contains('ig-backdrop')) { closePanel(); return; }
    const ap = e.target.closest('[data-ig-approve]');
    if (ap) { approved.add(ap.dataset.igApprove); saveApproved(); repaint(ap.dataset.igApprove); openPanel(ap.dataset.igApprove); return; }
    const un = e.target.closest('[data-ig-unapprove]');
    if (un) { approved.delete(un.dataset.igUnapprove); saveApproved(); repaint(un.dataset.igUnapprove); openPanel(un.dataset.igUnapprove); return; }
    const js = e.target.closest('[data-ig-json]');
    if (js) { const pre = document.querySelector('.ig-json'); pre.hidden = !pre.hidden; pre.textContent = apiView(results.get(js.dataset.igJson)); }
  }, true);

  document.addEventListener('keydown', e => { if (e.key === 'Escape') closePanel(); });

  function payGuard(r, payBtn) {
    closePanel();
    const red = r.decizie === 'BLOCHEAZA';
    const back = document.createElement('div');
    back.className = 'ig-backdrop ig-open ig-center';
    back.innerHTML = `
      <div class="ig-guard ${red ? 'ig-guard-bad' : 'ig-guard-warn'}">
        <div class="ig-kicker">◆ InvoiceGuard</div>
        <h2>${red ? 'Plata a fost blocată' : 'Factura trebuie verificată înainte de plată'}</h2>
        <p class="ig-meta">${esc(r.furnizor)} · ${esc(r.factura)} · ${lei(r.total)}</p>
        <ul class="ig-checks">${r.motive.map(m => `<li class="ig-c-${m.nivel}"><span class="ig-ic">${ICON[m.nivel]}</span><div><p>${esc(m.text)}</p></div></li>`).join('')}</ul>
        <div class="ig-action"><b>Ce faceți:</b> ${esc(r.actiune_recomandata)}</div>
        <footer class="ig-panel-foot">
          ${red ? '' : '<button class="ig-btn ig-btn-primary" data-ig-payanyway>Am verificat, plătește</button>'}
          <button class="ig-btn" data-ig-details>Vezi toate verificările</button>
          <button class="ig-btn" data-ig-close>${red ? 'Am înțeles' : 'Anulează'}</button>
        </footer>
      </div>`;
    document.body.appendChild(back);
    back.querySelector('[data-ig-details]').addEventListener('click', () => openPanel(r.key));
    const any = back.querySelector('[data-ig-payanyway]');
    if (any) any.addEventListener('click', () => {
      approved.add(r.key); saveApproved(); closePanel(); repaint(r.key);
      allowOnce = payBtn; payBtn.click();
    });
  }

  function toast(msg) {
    const t = document.createElement('div');
    t.className = 'ig-toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 4200);
  }

  new MutationObserver(enhance).observe(document.body, { childList: true, subtree: true });
  enhance();
})();
