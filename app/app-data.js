// Datele soft-ului de facturare simulat (ce vede contabilul în lista „Facturi primite”).
// Soft-ul NU știe nimic despre contracte, IBAN-uri sau istoricul plăților.
window.APP_DATA = {
  firma: { nume: 'Atelier Nord SRL', cif: 'RO40112233' },
  facturiPrimite: [
    { nr: 'WS-019',         furnizor: 'Web Studio Creativ SRL', cif: '88880008', data: '2026-10-10', scadenta: '2026-11-09', total: 1815.00,  sursa: 'SPV',   stare: 'Neplătită' },
    { nr: 'PE-311',         furnizor: 'Print Express SRL',      cif: '77770007', data: '2026-10-12', scadenta: '2026-10-26', total: 1089.00,  sursa: 'SPV',   stare: 'Neplătită' },
    { nr: 'QC-10233',       furnizor: 'Quanta Computer SRL',    cif: '33330003', data: '2026-10-14', scadenta: '2026-11-13', total: 5662.80,  sursa: 'SPV',   stare: 'Neplătită' },
    { nr: 'EF-2026-10-778', furnizor: 'Energo Furnizare SA',    cif: '55550005', data: '2026-10-15', scadenta: '2026-10-30', total: 8349.00,  sursa: 'SPV',   stare: 'Neplătită' },
    { nr: 'TN-88213',       furnizor: 'TeleNet Fibra SA',       cif: '11110001', data: '2026-10-18', scadenta: '2026-10-30', total: 450.12,   sursa: 'SPV',   stare: 'Neplătită' },
    { nr: 'BP-1203',        furnizor: 'Birotica Plus SRL',      cif: '44440004', data: '2026-10-19', scadenta: '2026-11-02', total: 3799.40,  sursa: 'SPV',   stare: 'Neplătită' },
    { nr: 'QC-2026-0412',   furnizor: 'Quanta Computers SRL',   cif: '48889999', data: '2026-10-20', scadenta: '2026-10-27', total: 47916.00, sursa: 'E-mail', stare: 'Neplătită' },
    { nr: 'TR-5521',        furnizor: 'Transport Rapid SRL',    cif: '66660006', data: '2026-10-21', scadenta: '2026-11-05', total: 4356.00,  sursa: 'SPV',   stare: 'Neplătită' },
    { nr: 'CL-0042',        furnizor: 'Clean Pro SRL',          cif: '22220002', data: '2026-10-22', scadenta: '2026-10-31', total: 3630.00,  sursa: 'SPV',   stare: 'Neplătită' },
    { nr: 'BP-1187',        furnizor: 'Birotica Plus SRL',      cif: '44440004', data: '2026-10-23', scadenta: '2026-11-06', total: 4598.00,  sursa: 'E-mail', stare: 'Neplătită' },
    { nr: 'BP-1187',        furnizor: 'Birotica Plus SRL',      cif: '44440004', data: '2026-09-15', scadenta: '2026-09-29', total: 4598.00,  sursa: 'SPV',   stare: 'Plătită' },
    { nr: 'TN-87102',       furnizor: 'TeleNet Fibra SA',       cif: '11110001', data: '2026-09-18', scadenta: '2026-09-30', total: 450.12,   sursa: 'SPV',   stare: 'Plătită' },
  ],
};
