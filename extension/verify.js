// Motorul de verificare: reguli clare, explicabile. Fiecare verificare întoarce
// { id, titlu, status: 'ok' | 'galben' | 'rosu' | 'na', detalii, scurt }.
(function () {
  const ZI = 86400000;
  const TARI = { LV: 'Letonia', LT: 'Lituania', EE: 'Estonia', BG: 'Bulgaria', HU: 'Ungaria', CY: 'Cipru', GB: 'Marea Britanie', DE: 'Germania', PL: 'Polonia' };
  const BANCI = { BTRL: 'Banca Transilvania', INGB: 'ING Bank', BRDE: 'BRD', RNCB: 'BCR', BACX: 'UniCredit', CECE: 'CEC Bank' };

  const lei = n => new Intl.NumberFormat('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + ' lei';
  const dataRo = s => s.split('-').reverse().join('.');
  const round2 = n => Math.round(n * 100) / 100;
  const zile = (a, b) => Math.round((new Date(b) - new Date(a)) / ZI);

  function normName(s) {
    return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9 ]/g, ' ').split(/\s+/)
      .filter(t => t && !['srl', 'sa', 's', 'r', 'l', 'a', 'pfa', 'ii'].includes(t)).join('');
  }

  function levenshtein(a, b) {
    const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      let prev = dp[0];
      dp[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const tmp = dp[j];
        dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
        prev = tmp;
      }
    }
    return dp[b.length];
  }

  function ibanInfo(iban) {
    const tara = iban.slice(0, 2);
    if (tara !== 'RO') return `cont din ${TARI[tara] || tara}`;
    return BANCI[iban.slice(4, 8)] || 'bancă necunoscută';
  }
  const ibanScurt = iban => iban.slice(0, 8) + '…' + iban.slice(-4);

  function verifyInvoice(req, D) {
    const key = req.cui + '|' + req.nr;
    const f = D.facturi[key] || { cui: req.cui, nr: req.nr, furnizor: req.furnizor, sursa: 'necunoscută', iban: null, linii: [] };
    const net = f.linii.reduce((s, l) => s + l.cant * l.pret, 0);
    const total = f.linii.length ? round2(net * (1 + D.cotaTva)) : req.total;
    const contract = D.contracte[f.cui];
    const firma = D.anaf[f.cui];
    const istoric = D.plati.filter(p => p.cui === f.cui).sort((a, b) => a.data.localeCompare(b.data));
    const checks = [];

    // 1. Există în SPV pentru CUI-ul nostru
    if (D.spv.has(key)) {
      checks.push({ id: 'spv', titlu: 'Factura există în SPV (e-Factura)', status: 'ok', detalii: `Găsită în SPV pentru CUI ${D.firma.cui}.` });
    } else {
      checks.push({ id: 'spv', titlu: 'Factura există în SPV (e-Factura)', status: 'rosu', scurt: 'Nu e în SPV',
        detalii: `Factura a venit pe ${f.sursa === 'E-mail' ? 'e-mail (PDF)' : 'alt canal'} și nu apare în SPV pentru CUI ${D.firma.cui}. Între firme, factura legală este XML-ul din e-Factura.` });
    }

    // 2. IBAN-ul e cel din contract / din plățile anterioare
    const ibanCunoscute = new Set([contract && contract.iban, ...istoric.map(p => p.iban)].filter(Boolean));
    if (!f.iban) {
      checks.push({ id: 'iban', titlu: 'IBAN conform contractului', status: 'na', detalii: 'Factura nu conține IBAN.' });
    } else if (ibanCunoscute.has(f.iban)) {
      checks.push({ id: 'iban', titlu: 'IBAN conform contractului', status: 'ok', detalii: `${ibanScurt(f.iban)} (${ibanInfo(f.iban)}) — același cont ca în contract și în plățile anterioare.` });
    } else if (ibanCunoscute.size) {
      const vechi = [...ibanCunoscute][0];
      checks.push({ id: 'iban', titlu: 'IBAN conform contractului', status: 'rosu', scurt: 'IBAN schimbat',
        detalii: `IBAN-ul de pe factură ${ibanScurt(f.iban)} (${ibanInfo(f.iban)}) diferă de cel din contract ${ibanScurt(vechi)} (${ibanInfo(vechi)}).` });
    } else if (!f.iban.startsWith('RO')) {
      checks.push({ id: 'iban', titlu: 'IBAN conform contractului', status: 'rosu', scurt: 'IBAN străin',
        detalii: `IBAN ${ibanScurt(f.iban)} — ${ibanInfo(f.iban)}. Furnizor fără contract și fără plăți anterioare.` });
    } else {
      checks.push({ id: 'iban', titlu: 'IBAN conform contractului', status: 'galben', scurt: 'IBAN nou',
        detalii: `IBAN ${ibanScurt(f.iban)} (${ibanInfo(f.iban)}) — nu avem contract sau plăți anterioare cu care să-l comparăm.` });
    }

    // 3. Firma există la ANAF, e activă, numele corespunde, TVA
    if (!firma) {
      checks.push({ id: 'anaf', titlu: 'Firmă activă la ANAF', status: 'rosu', scurt: 'CUI inexistent', detalii: `CUI ${f.cui} nu există în registrul ANAF.` });
    } else if (firma.stare !== 'activ') {
      checks.push({ id: 'anaf', titlu: 'Firmă activă la ANAF', status: 'rosu', scurt: 'Firmă inactivă',
        detalii: `${firma.denumire} este ${firma.motiv || 'inactivă'}. TVA-ul de pe facturile de la contribuabili inactivi nu este deductibil.` });
    } else if (normName(firma.denumire) !== normName(f.furnizor)) {
      checks.push({ id: 'anaf', titlu: 'Firmă activă la ANAF', status: 'rosu', scurt: 'Nume ≠ CUI',
        detalii: `Pe factură scrie „${f.furnizor}”, dar CUI ${f.cui} aparține firmei „${firma.denumire}”.` });
    } else if (!firma.tva && f.linii.length) {
      checks.push({ id: 'anaf', titlu: 'Firmă activă la ANAF', status: 'rosu', scurt: 'TVA ilegal',
        detalii: `Factura are TVA ${D.cotaTva * 100}%, dar ${firma.denumire} nu e înregistrată în scopuri de TVA.` });
    } else {
      checks.push({ id: 'anaf', titlu: 'Firmă activă la ANAF', status: 'ok', detalii: `${firma.denumire}, activă, plătitoare de TVA.` });
    }
    if (firma && zile(firma.inregistrare, D.azi) < 180) {
      checks.push({ id: 'vechime', titlu: 'Vechimea firmei', status: 'galben', scurt: 'Firmă nouă',
        detalii: `Înființată pe ${dataRo(firma.inregistrare)} (acum ${zile(firma.inregistrare, D.azi)} de zile).` });
    }

    // 4. Avem contract
    if (contract) {
      checks.push({ id: 'contract', titlu: 'Contract cu furnizorul', status: 'ok', detalii: `Contract ${contract.nr} din ${dataRo(contract.data)}.` });
    } else {
      checks.push({ id: 'contract', titlu: 'Contract cu furnizorul', status: 'galben', scurt: 'Fără contract',
        detalii: 'Nu avem contract încărcat cu acest furnizor (furnizor nou).' });
    }

    // 5. Prețuri conform contractului
    if (contract && f.linii.length) {
      const probleme = [];
      let diferenta = 0;
      for (const l of f.linii) {
        const art = contract.articole[l.cod];
        if (!art) {
          probleme.push(`„${l.denumire}” nu apare în contract`);
        } else if (l.pret > art.pret) {
          const d = (l.pret - art.pret) * l.cant * (1 + D.cotaTva);
          diferenta += d;
          probleme.push(`„${l.denumire}”: ${lei(l.pret)}/${art.um} facturat vs. ${lei(art.pret)}/${art.um} în contract (+${lei(d)} cu TVA)`);
        }
      }
      if (probleme.length) {
        checks.push({ id: 'pret', titlu: 'Prețuri conform contractului', status: 'galben',
          scurt: diferenta ? '+' + lei(round2(diferenta)).replace(',00', '') : 'Articol nou', detalii: probleme.join('; ') + '.', diferenta: round2(diferenta) });
      } else {
        checks.push({ id: 'pret', titlu: 'Prețuri conform contractului', status: 'ok', detalii: 'Toate liniile au prețul din contract.' });
      }
    } else {
      checks.push({ id: 'pret', titlu: 'Prețuri conform contractului', status: 'na', detalii: 'Nu există contract cu care să comparăm.' });
    }

    // 6. Dublură
    const platita = istoric.find(p => p.nr === f.nr);
    const aceeasiSuma = !(contract && contract.recurent) &&
      istoric.find(p => p.nr !== f.nr && Math.abs(p.total - total) < 0.01 && zile(p.data, D.azi) <= 35);
    if (platita) {
      checks.push({ id: 'dublura', titlu: 'Nu e dublură', status: 'rosu', scurt: 'Dublură',
        detalii: `Factura ${f.nr} a fost deja plătită pe ${dataRo(platita.data)} (${lei(platita.total)}).`, platitaPe: platita.data });
    } else if (aceeasiSuma) {
      checks.push({ id: 'dublura', titlu: 'Nu e dublură', status: 'galben', scurt: 'Posibilă dublură',
        detalii: `Aceeași sumă (${lei(total)}) a fost plătită pe ${dataRo(aceeasiSuma.data)} pentru factura ${aceeasiSuma.nr}.` });
    } else {
      checks.push({ id: 'dublura', titlu: 'Nu e dublură', status: 'ok', detalii: 'Număr și sumă unice în istoricul plăților.' });
    }

    // 7. Sumă neobișnuită față de istoric
    const ultimele = istoric.slice(-6);
    if (ultimele.length >= 3) {
      const medie = ultimele.reduce((s, p) => s + p.total, 0) / ultimele.length;
      const raport = total / medie;
      checks.push(raport >= 2
        ? { id: 'suma', titlu: 'Sumă obișnuită pentru furnizor', status: 'galben', scurt: `${raport.toFixed(1)}× media`,
            detalii: `${lei(total)} este de ${raport.toFixed(1)}× media ultimelor ${ultimele.length} facturi (${lei(round2(medie))}).` }
        : { id: 'suma', titlu: 'Sumă obișnuită pentru furnizor', status: 'ok', detalii: `În linie cu media ultimelor facturi (${lei(round2(medie))}).` });
    } else {
      checks.push({ id: 'suma', titlu: 'Sumă obișnuită pentru furnizor', status: 'na', detalii: 'Istoric insuficient.' });
    }

    // 8. Dovadă de livrare
    const docs = D.documente[key] || [];
    if (contract && !contract.livrareNecesara) {
      checks.push({ id: 'livrare', titlu: 'Dovadă de livrare', status: 'na', detalii: 'Serviciu recurent, nu necesită aviz/PV.' });
    } else if (docs.length) {
      checks.push({ id: 'livrare', titlu: 'Dovadă de livrare', status: 'ok', detalii: docs.map(d => `${d.tip} ${d.nr}`).join(', ') + '.' });
    } else {
      checks.push({ id: 'livrare', titlu: 'Dovadă de livrare', status: 'galben', scurt: 'Fără aviz/PV',
        detalii: 'Nu există aviz, PV de recepție sau CMR încărcat pentru această factură.' });
    }

    // 9. Nume asemănător cu un furnizor cunoscut (frauda „Quanta”)
    const n = normName(f.furnizor);
    const sosie = Object.keys(D.contracte)
      .filter(cui => cui !== f.cui && D.anaf[cui])
      .map(cui => ({ cui, nume: D.anaf[cui].denumire }))
      .find(c => { const m = normName(c.nume); return m !== n && levenshtein(m, n) <= 2; });
    if (sosie) {
      checks.push({ id: 'sosie', titlu: 'Nu imită un furnizor cunoscut', status: 'rosu', scurt: 'Nume clonat',
        detalii: `„${f.furnizor}” (CUI ${f.cui}) seamănă cu furnizorul vostru „${sosie.nume}” (CUI ${sosie.cui}), dar e altă firmă.`, sosie });
    } else {
      checks.push({ id: 'sosie', titlu: 'Nu imită un furnizor cunoscut', status: 'ok', detalii: 'Niciun furnizor cu nume asemănător.' });
    }

    const rosii = checks.filter(c => c.status === 'rosu');
    const galbene = checks.filter(c => c.status === 'galben');
    const decizie = rosii.length ? 'BLOCHEAZA' : galbene.length ? 'VERIFICA' : 'PLATESTE';
    const scor = Math.min(100, rosii.length * 35 + galbene.length * 12 + (decizie === 'PLATESTE' ? 3 : 0));

    return {
      key, factura: f.nr, furnizor: f.furnizor, cui: f.cui, total, sursa: f.sursa, iban: f.iban,
      ibanPlata: contract ? contract.iban : (istoric.length ? istoric[istoric.length - 1].iban : null),
      contract: contract || null, linii: f.linii,
      decizie, scor_risc: scor,
      motive: [...rosii, ...galbene].map(c => ({ nivel: c.status, text: c.detalii, scurt: c.scurt })),
      verificari: checks,
      actiune_recomandata: recommend(checks, contract, D),
    };
  }

  function recommend(checks, contract, D) {
    const by = id => checks.find(c => c.id === id);
    if (by('sosie') && by('sosie').status === 'rosu') {
      const s = by('sosie').sosie, c = D.contracte[s.cui];
      return `Nu plătiți. Sunați la ${s.nume} la numărul din contract (${c.telefon}) și întrebați dacă au emis factura. Cel mai probabil e o tentativă de fraudă.`;
    }
    if (by('dublura').status === 'rosu') return `Nu plătiți: factura a fost deja achitată pe ${dataRo(by('dublura').platitaPe)}. Arhivați-o ca dublură.`;
    if (by('iban').status === 'rosu' && contract) return `Sunați la ${contract.persoana}, la numărul din contract (${contract.telefon}), nu la cel de pe factură sau din e-mail, și confirmați schimbarea contului.`;
    if (by('anaf').status === 'rosu') return 'Nu plătiți până nu clarificați situația fiscală a furnizorului (verificați pe anaf.ro).';
    if (by('spv').status === 'rosu') return 'Cereți furnizorului să transmită factura prin e-Factura. Nu plătiți facturi care nu sunt în SPV.';
    if (by('pret').status === 'galben' && by('pret').diferenta) return `Cereți o factură de stornare pentru diferența de ${lei(by('pret').diferenta)} sau aprobați manual dacă există un act adițional.`;
    if (by('suma').status === 'galben') return 'Comparați consumul cu luna anterioară. Dacă e corect, aprobați manual.';
    if (by('contract').status === 'galben') return 'Furnizor nou: încărcați contractul sau comanda și aprobați manual.';
    if (by('livrare').status === 'galben') return 'Cereți colegilor PV-ul de recepție înainte de plată.';
    return 'Totul e în regulă. Factura poate fi inclusă în fișierul de plăți.';
  }

  window.IG = { verifyInvoice, lei, dataRo };

  // În produs: fetch('https://api.<domeniu>/verify', { method: 'POST', body: JSON.stringify(req) })
  window.IG_API = {
    verify: req => new Promise(resolve =>
      setTimeout(() => resolve(verifyInvoice(req, window.IG_DATA)), 350 + Math.random() * 900)),
  };
})();
