# InvoiceGuard: verificarea facturilor înainte de plată

Demo pentru Provocarea 4. Pagina `index.html` simulează lista „Facturi primite” dintr-un soft de facturare online.
Add-on-ul (`extension/`) adaugă coloana **Verificare** fără să modifice codul paginii, exact cum ar face o extensie Chrome
peste soft-ul real.

## Pornire
Dublu-click pe `index.html` (Chrome). Nu are nevoie de server sau instalări.

Comutatorul **Add-on activ** din stânga-jos arată pagina fără/cu add-on (înainte/după).

### Ca extensie Chrome adevărată
1. `chrome://extensions` → activează **Developer mode** → **Load unpacked** → alege folderul `extension/`.
2. La extensie: **Details** → activează **Allow access to file URLs**.
3. Debifează „Add-on activ” din pagină: coloana apare oricum, injectată de extensie.

## Ce verifică
| # | Verificare | Rezultat dacă pică |
|---|---|---|
| 1 | Factura există în SPV (e-Factura) | 🔴 |
| 2 | IBAN-ul e cel din contract / plăți anterioare | 🔴 |
| 3 | Firma e activă la ANAF, numele corespunde CUI-ului, e plătitoare de TVA | 🔴 |
| 4 | Firma nu e înființată recent (< 180 zile) | 🟡 |
| 5 | Există contract | 🟡 |
| 6 | Prețuri conform contractului (diferența în lei) | 🟡 |
| 7 | Nu e dublură (număr deja plătit / aceeași sumă recent) | 🔴 / 🟡 |
| 8 | Sumă obișnuită față de media ultimelor 6 facturi | 🟡 |
| 9 | Dovadă de livrare (aviz, PV, CMR) | 🟡 |
| 10 | Numele nu imită un furnizor cunoscut („Quanta Computers” vs. „Quanta Computer”) | 🔴 |

Orice 🔴 înseamnă **Blochează**, orice 🟡 înseamnă **Verifică**, altfel **Plătește**.

Acțiuni declanșate:
- butonul „Plătește” al soft-ului e interceptat: blocat pentru 🔴, confirmare pentru 🟡;
- „Exportă plăți aprobate” generează CSV-ul pentru bancă doar cu facturile aprobate, cu IBAN-ul **din contract**.

## Scenariul de demo
| Factură | Ce arată |
|---|---|
| QC-2026-0412 Quanta Computers SRL | Frauda Facebook/Google: nu e în SPV, IBAN din Letonia, nume clonat, firmă nouă |
| TR-5521 Transport Rapid | IBAN schimbat față de contract („ne-am schimbat contul”) |
| BP-1187 Birotica Plus | Dublură, deja plătită pe 28.09 |
| PE-311 Print Express | Firmă inactivă fiscal |
| CL-0042 Clean Pro | +605 lei peste prețul din contract |
| EF-2026-10-778 Energo | Sumă de 3× media |
| WS-019 Web Studio | Furnizor nou, fără contract și fără PV |
| TN-88213, BP-1203, QC-10233 | În regulă: Plătește |

## Structură
- `index.html`, `app/`: soft-ul de facturare simulat (nu știe nimic de add-on)
- `extension/addon.js`: citește tabelul din DOM, adaugă coloana, panoul de detalii, blocarea plății, exportul
- `extension/verify.js`: motorul de reguli (ce ar fi `POST /api/verify` în produs)
- `extension/data.js`: date simulate pentru ANAF, SPV, contracte, plăți, documente

## Ce e simulat
- **ANAF**: în produs se folosește API-ul public gratuit `webservicesp.anaf.ro` (stare, TVA, denumire). Din browser e blocat de CORS, așa că trebuie apelat dintr-un backend.
- **SPV**: accesul cere certificat digital, deci e simulat.
- **Contractele**: în produs, termenii (prețuri, IBAN, contact) se extrag cu AI din PDF-ul contractului. Deciziile rămân reguli explicabile.

## Cum lucrăm în echipă
1. `git clone` repo-ul, apoi o ramură nouă pentru fiecare funcționalitate: `git checkout -b nume-funcționalitate`.
2. Commit, `git push -u origin nume-funcționalitate`, apoi deschideți un Pull Request pe GitHub.
3. Unde adăugați lucruri:
   - o verificare nouă → `extension/verify.js` (în `verifyInvoice`) + date de test în `extension/data.js`;
   - facturi noi în listă → `app/app-data.js` **și** detaliile lor în `extension/data.js` (`facturi`);
   - aspectul coloanei / panoului → `extension/addon.css`, `extension/addon.js`.
