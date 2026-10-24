// Datele soft-ului de facturare simulat (ce vede contabilul în lista „Facturi primite”).
// Soft-ul NU știe nimic despre contracte, IBAN-uri sau istoricul plăților.
window.APP_DATA = {
  firma: { nume: 'Atelier Nord SRL', cif: 'RO40112233' },
  facturiPrimite: [
    { nr: 'ALX-2026-55871', furnizor: 'ALTEX ROMANIA SRL',          cif: '2864518',  data: '2026-10-10', scadenta: '2026-11-09', total: 2964.50,  sursa: 'SPV',    stare: 'Neplătită' },
    { nr: 'ORN-7781203',    furnizor: 'ORANGE ROMANIA SA',          cif: '9010105',  data: '2026-10-12', scadenta: '2026-10-26', total: 1361.25,  sursa: 'SPV',    stare: 'Neplătită' },
    { nr: 'DI-10233',       furnizor: 'DANTE INTERNATIONAL SA',     cif: '14399840', data: '2026-10-14', scadenta: '2026-11-13', total: 5662.80,  sursa: 'SPV',    stare: 'Neplătită' },
    { nr: 'EF-2026-10-778', furnizor: 'ELECTRICA FURNIZARE SA',     cif: '28909028', data: '2026-10-15', scadenta: '2026-10-30', total: 8349.00,  sursa: 'SPV',    stare: 'Neplătită' },
    { nr: 'DG-88213',       furnizor: 'DIGI ROMANIA S.A.',          cif: '5888716',  data: '2026-10-18', scadenta: '2026-10-30', total: 450.12,   sursa: 'SPV',    stare: 'Neplătită' },
    { nr: 'DED-1203',       furnizor: 'DEDEMAN SRL',                cif: '2816464',  data: '2026-10-19', scadenta: '2026-11-02', total: 3799.40,  sursa: 'SPV',    stare: 'Neplătită' },
    { nr: 'DI-2026-0412',   furnizor: 'DANTE INTERNATIONAL S.R.L.', cif: '59880002', data: '2026-10-20', scadenta: '2026-10-27', total: 47916.00, sursa: 'E-mail', stare: 'Neplătită' },
    { nr: 'PTR-5521',       furnizor: 'OMV PETROM SA',              cif: '1590082',  data: '2026-10-21', scadenta: '2026-11-05', total: 4356.00,  sursa: 'SPV',    stare: 'Neplătită' },
    { nr: 'DED-1187',       furnizor: 'DEDEMAN SRL',                cif: '2816464',  data: '2026-10-23', scadenta: '2026-11-06', total: 4598.00,  sursa: 'E-mail', stare: 'Neplătită' },
    { nr: 'DED-1187',       furnizor: 'DEDEMAN SRL',                cif: '2816464',  data: '2026-09-15', scadenta: '2026-09-29', total: 4598.00,  sursa: 'SPV',    stare: 'Plătită' },
    { nr: 'DG-87102',       furnizor: 'DIGI ROMANIA S.A.',          cif: '5888716',  data: '2026-09-18', scadenta: '2026-09-30', total: 450.12,   sursa: 'SPV',    stare: 'Plătită' },
  ],
};
