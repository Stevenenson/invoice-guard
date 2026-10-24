// „Backend-ul” add-on-ului, simulat local pentru demo.
// În produs: registrul ANAF vine din API-ul public ANAF, SPV din e-Factura,
// contractele și documentele din ce încarcă firma, plățile din extrasele bancare.
(function () {
  const anaf = {
    '11110001': { denumire: 'TeleNet Fibra SA',       stare: 'activ',   inregistrare: '2009-03-12', tva: true },
    '22220002': { denumire: 'Clean Pro SRL',          stare: 'activ',   inregistrare: '2016-07-01', tva: true },
    '33330003': { denumire: 'Quanta Computer SRL',    stare: 'activ',   inregistrare: '2011-11-23', tva: true },
    '44440004': { denumire: 'Birotica Plus SRL',      stare: 'activ',   inregistrare: '2008-02-14', tva: true },
    '55550005': { denumire: 'Energo Furnizare SA',    stare: 'activ',   inregistrare: '2005-09-30', tva: true },
    '66660006': { denumire: 'Transport Rapid SRL',    stare: 'activ',   inregistrare: '2013-04-08', tva: true },
    '77770007': { denumire: 'Print Express SRL',      stare: 'inactiv', inregistrare: '2014-05-20', tva: true, motiv: 'declarată inactivă fiscal din 01.08.2026' },
    '88880008': { denumire: 'Web Studio Creativ SRL', stare: 'activ',   inregistrare: '2019-01-17', tva: true },
    '48889999': { denumire: 'Quanta Computers SRL',   stare: 'activ',   inregistrare: '2026-09-02', tva: false },
  };

  const contracte = {
    '11110001': { nr: 'C-14/2024', data: '2024-01-10', iban: 'RO49BTRLRONCRT0011110001', telefon: '021 300 1000', persoana: 'Ioana Marin',   recurent: true,  livrareNecesara: false,
                  articole: { 'INT-500': { denumire: 'Abonament internet 500 Mbps', um: 'lună', pret: 372 } } },
    '22220002': { nr: 'C-03/2025', data: '2025-02-01', iban: 'RO12INGB0000999922220002', telefon: '0722 410 220', persoana: 'Mihai Dobre',   recurent: true,  livrareNecesara: false,
                  articole: { 'CUR-LUNA': { denumire: 'Curățenie birouri (lunar)', um: 'lună', pret: 2500 } } },
    '33330003': { nr: 'C-21/2023', data: '2023-06-15', iban: 'RO66BRDE445SV33330003001', telefon: '021 255 3300', persoana: 'Andrei Pop',    recurent: false, livrareNecesara: true,
                  articole: { 'MON-27': { denumire: 'Monitor 27"', um: 'buc', pret: 780 }, 'LAP-15': { denumire: 'Laptop 15"', um: 'buc', pret: 3100 } } },
    '44440004': { nr: 'C-08/2022', data: '2022-03-01', iban: 'RO21RNCB0090000044440004', telefon: '0744 120 330', persoana: 'Elena Stan',    recurent: false, livrareNecesara: true,
                  articole: { 'A4-CUTIE': { denumire: 'Hârtie A4 (cutie 5 topuri)', um: 'cutie', pret: 95 }, 'TONER-HP': { denumire: 'Toner HP 59A', um: 'buc', pret: 310 } } },
    '55550005': { nr: 'C-01/2024', data: '2024-01-01', iban: 'RO35BACX0000004455550005', telefon: '0800 800 900', persoana: 'Dispecerat',    recurent: true,  livrareNecesara: false,
                  articole: { 'EN-KWH': { denumire: 'Energie electrică', um: 'kWh', pret: 0.92 } } },
    '66660006': { nr: 'C-11/2025', data: '2025-05-20', iban: 'RO80CECEB0003RON66660006', telefon: '0731 555 010', persoana: 'Radu Ilie',     recurent: false, livrareNecesara: true,
                  articole: { 'CURSA-LOC': { denumire: 'Cursă transport marfă (local)', um: 'cursă', pret: 1200 } } },
    '77770007': { nr: 'C-05/2024', data: '2024-04-02', iban: 'RO55BTRLRONCRT0077770007', telefon: '0755 600 700', persoana: 'Dana Lupu',     recurent: false, livrareNecesara: true,
                  articole: { 'FLY-A5': { denumire: 'Flyere A5 color', um: 'buc', pret: 0.45 } } },
  };

  // Ce facturi există în SPV (e-Factura) pentru CUI-ul nostru.
  const spv = new Set([
    '11110001|TN-88213', '11110001|TN-87102', '22220002|CL-0042', '33330003|QC-10233',
    '44440004|BP-1203', '44440004|BP-1187', '55550005|EF-2026-10-778', '66660006|TR-5521',
    '77770007|PE-311', '88880008|WS-019',
  ]);

  // Dovezi de livrare încărcate (aviz, PV de recepție, CMR).
  const documente = {
    '33330003|QC-10233': [{ tip: 'Aviz de însoțire', nr: 'AV-5512' }],
    '44440004|BP-1203':  [{ tip: 'Aviz de însoțire', nr: 'AV-901' }],
    '44440004|BP-1187':  [{ tip: 'Aviz de însoțire', nr: 'AV-874' }],
    '66660006|TR-5521':  [{ tip: 'CMR', nr: 'CMR-20331' }],
    '77770007|PE-311':   [{ tip: 'PV recepție', nr: 'PV-77' }],
  };

  // Istoric plăți, ultimele 6 luni (aprilie–septembrie 2026), sume fără TVA.
  const istoric = [
    ['11110001', 'TN-',      82002, 1020, 0, [372, 372, 372, 372, 372, 372]],
    ['22220002', 'CL-',      36,    1,    4, [2500, 2500, 2500, 2500, 2500, 2500]],
    ['33330003', 'QC-',      9800,  70,   0, [1560, 3900, 2340, 4680, 1560, 3120]],
    ['44440004', 'BP-',      1102,  17,   0, [2850, 3420, 2280, 3990, 3040, 3800]],
    ['55550005', 'EF-2026-', 4,     1,    2, [2208, 2392, 2116, 2484, 2300, 2024]],
    ['66660006', 'TR-',      5390,  22,   0, [3600, 2400, 4800, 2400, 3600, 2400]],
    ['77770007', 'PE-',      280,   6,    0, [900, 1350, 450, 900, 450, 1350]],
  ];
  const plati = [];
  for (const [cui, prefix, start, step, pad, nets] of istoric) {
    nets.forEach((net, i) => {
      plati.push({
        cui,
        nr: prefix + String(start + i * step).padStart(pad, '0'),
        data: `2026-${String(4 + i).padStart(2, '0')}-28`,
        total: Math.round(net * 121) / 100,
        iban: contracte[cui].iban,
      });
    });
  }

  // Detaliile complete ale facturilor primite (XML din SPV sau PDF citit din e-mail).
  const facturi = [
    { cui: '11110001', nr: 'TN-88213', furnizor: 'TeleNet Fibra SA', sursa: 'SPV', iban: 'RO49BTRLRONCRT0011110001',
      linii: [{ cod: 'INT-500', denumire: 'Abonament internet 500 Mbps – oct. 2026', cant: 1, pret: 372 }] },
    { cui: '22220002', nr: 'CL-0042', furnizor: 'Clean Pro SRL', sursa: 'SPV', iban: 'RO12INGB0000999922220002',
      linii: [{ cod: 'CUR-LUNA', denumire: 'Curățenie birouri – oct. 2026', cant: 1, pret: 3000 }] },
    { cui: '48889999', nr: 'QC-2026-0412', furnizor: 'Quanta Computers SRL', sursa: 'E-mail', iban: 'LV80BANK0000435195001',
      linii: [{ cod: 'LAP-15', denumire: 'Laptop 15" i7 / 32GB', cant: 12, pret: 3300 }] },
    { cui: '44440004', nr: 'BP-1187', furnizor: 'Birotica Plus SRL', sursa: 'E-mail', iban: 'RO21RNCB0090000044440004',
      linii: [{ cod: 'A4-CUTIE', denumire: 'Hârtie A4 (cutie 5 topuri)', cant: 40, pret: 95 }] },
    { cui: '44440004', nr: 'BP-1203', furnizor: 'Birotica Plus SRL', sursa: 'SPV', iban: 'RO21RNCB0090000044440004',
      linii: [{ cod: 'A4-CUTIE', denumire: 'Hârtie A4 (cutie 5 topuri)', cant: 20, pret: 95 },
              { cod: 'TONER-HP', denumire: 'Toner HP 59A', cant: 4, pret: 310 }] },
    { cui: '55550005', nr: 'EF-2026-10-778', furnizor: 'Energo Furnizare SA', sursa: 'SPV', iban: 'RO35BACX0000004455550005',
      linii: [{ cod: 'EN-KWH', denumire: 'Energie electrică – sept. 2026', cant: 7500, pret: 0.92 }] },
    { cui: '66660006', nr: 'TR-5521', furnizor: 'Transport Rapid SRL', sursa: 'SPV', iban: 'RO09BTRLRONCRT0099991111',
      linii: [{ cod: 'CURSA-LOC', denumire: 'Cursă transport marfă (local)', cant: 3, pret: 1200 }] },
    { cui: '33330003', nr: 'QC-10233', furnizor: 'Quanta Computer SRL', sursa: 'SPV', iban: 'RO66BRDE445SV33330003001',
      linii: [{ cod: 'MON-27', denumire: 'Monitor 27"', cant: 6, pret: 780 }] },
    { cui: '77770007', nr: 'PE-311', furnizor: 'Print Express SRL', sursa: 'SPV', iban: 'RO55BTRLRONCRT0077770007',
      linii: [{ cod: 'FLY-A5', denumire: 'Flyere A5 color', cant: 2000, pret: 0.45 }] },
    { cui: '88880008', nr: 'WS-019', furnizor: 'Web Studio Creativ SRL', sursa: 'SPV', iban: 'RO77BTRLRONCRT0088880008',
      linii: [{ cod: 'WEB-MNT', denumire: 'Mentenanță site – oct. 2026', cant: 1, pret: 1500 }] },
  ];

  window.IG_DATA = {
    firma: { nume: 'Atelier Nord SRL', cui: '40112233' },
    azi: '2026-10-24',
    cotaTva: 0.21,
    anaf, contracte, spv, documente, plati,
    facturi: Object.fromEntries(facturi.map(f => [f.cui + '|' + f.nr, f])),
  };
})();
