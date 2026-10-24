// Soft-ul de facturare simulat. Nu știe nimic despre add-on: doar afișează tabelul.
(function () {
  const D = window.APP_DATA;
  const fmt = n => new Intl.NumberFormat('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  const dataRo = s => s.split('-').reverse().join('.');
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let tab = 'neplatite';
  let query = '';

  document.getElementById('company').textContent = `${D.firma.nume} · ${D.firma.cif}`;

  function visible() {
    const q = query.trim().toLowerCase();
    return D.facturiPrimite
      .map((f, i) => ({ ...f, id: i }))
      .filter(f => tab === 'toate' || (tab === 'platite') === (f.stare === 'Plătită'))
      .filter(f => !q || [f.nr, f.furnizor, f.cif].some(v => v.toLowerCase().includes(q)))
      .sort((a, b) => b.data.localeCompare(a.data));
  }

  function render() {
    const rows = visible();
    const table = document.getElementById('inv-table');
    table.innerHTML = `
      <thead><tr>
        <th class="chk"><input type="checkbox"></th>
        <th>Nr. factură</th><th>Furnizor</th><th>CIF</th><th>Data</th><th>Scadență</th>
        <th class="num">Total</th><th>Sursă</th><th>Stare</th><th class="act">Acțiuni</th>
      </tr></thead>
      <tbody>${rows.map(f => {
        const overdue = f.stare !== 'Plătită' && f.scadenta < '2026-10-24';
        return `<tr data-id="${f.id}">
          <td class="chk"><input type="checkbox"></td>
          <td><a href="#" class="link">${esc(f.nr)}</a></td>
          <td>${esc(f.furnizor)}</td>
          <td class="muted">${esc(f.cif)}</td>
          <td>${dataRo(f.data)}</td>
          <td class="${overdue ? 'overdue' : ''}">${dataRo(f.scadenta)}</td>
          <td class="num"><b>${fmt(f.total)}</b> RON</td>
          <td><span class="src src-${f.sursa === 'SPV' ? 'spv' : 'mail'}">${esc(f.sursa)}</span></td>
          <td><span class="status ${f.stare === 'Plătită' ? 'paid' : 'unpaid'}">${esc(f.stare)}</span></td>
          <td class="act">${f.stare === 'Plătită'
            ? '<button class="btn btn-sm btn-ghost" disabled>Plătită</button>'
            : '<button class="btn btn-sm btn-pay" data-action="pay">Plătește</button>'}
            <button class="btn btn-sm btn-ghost" title="Mai multe">⋯</button></td>
        </tr>`;
      }).join('')}</tbody>`;
    const sum = rows.reduce((s, f) => s + f.total, 0);
    document.getElementById('table-foot').textContent = `${rows.length} facturi · Total ${fmt(sum)} RON`;
  }

  document.getElementById('tabs').addEventListener('click', e => {
    const b = e.target.closest('button[data-tab]');
    if (!b) return;
    tab = b.dataset.tab;
    document.querySelectorAll('#tabs button').forEach(x => x.classList.toggle('active', x === b));
    render();
  });

  document.getElementById('search').addEventListener('input', e => { query = e.target.value; render(); });

  document.getElementById('inv-table').addEventListener('click', e => {
    const btn = e.target.closest('[data-action="pay"]');
    if (!btn) return;
    const f = D.facturiPrimite[btn.closest('tr').dataset.id];
    f.stare = 'Plătită';
    document.getElementById('pay-text').textContent =
      `Ordinul de plată pentru factura ${f.nr} (${f.furnizor}, ${fmt(f.total)} RON) a fost trimis la bancă.`;
    document.getElementById('pay-modal').hidden = false;
    render();
  });
  document.getElementById('pay-ok').addEventListener('click', () => { document.getElementById('pay-modal').hidden = true; });

  document.getElementById('btn-spv').addEventListener('click', e => {
    e.target.textContent = '☁ Sincronizat acum';
    setTimeout(() => { e.target.textContent = '☁ Preia din SPV'; }, 1500);
  });

  render();

  // --- Doar pentru demo: încarcă add-on-ul ca și cum ar fi extensia instalată. ---
  const toggle = document.getElementById('addon-toggle');
  let on = true;
  try { on = localStorage.getItem('demo.addon') !== 'off'; } catch (_) {}
  toggle.checked = on;
  toggle.addEventListener('change', () => {
    try { localStorage.setItem('demo.addon', toggle.checked ? 'on' : 'off'); } catch (_) {}
    location.reload();
  });
  if (on) {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'extension/addon.css';
    document.head.appendChild(css);
    for (const src of ['extension/data.js', 'extension/verify.js', 'extension/addon.js']) {
      const s = document.createElement('script');
      s.src = src;
      s.async = false;
      document.body.appendChild(s);
    }
  }
})();
