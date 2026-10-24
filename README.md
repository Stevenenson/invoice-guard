# InvoiceGuard: verificarea facturilor înainte de plată

Demo pentru Provocarea 4. Pagina `index.html` simulează lista „Facturi primite” dintr-un soft de facturare online.
Add-on-ul (`extension/`) adaugă coloana **Verificare** fără să modifice codul paginii, exact cum ar face o extensie Chrome
peste soft-ul real. Verificările le face API-ul Python (`backend/`), inclusiv o interogare **live la ANAF**.

## Pornire

Ai nevoie de Python 3.9 sau mai nou (`python3 --version`).

**macOS / Linux**
```bash
./run.sh
```

**Windows**
```bat
python -m venv .venv
.venv\Scripts\pip install -r backend\requirements.txt
.venv\Scripts\uvicorn backend.main:app --reload
```

Apoi deschide:
- **http://127.0.0.1:8000**: demo-ul (soft-ul de facturare simulat + add-on-ul)
- **http://127.0.0.1:8000/docs**: documentația API (Swagger), unde poți încerca fiecare endpoint

Comutatorul **Add-on activ** din stânga-jos arată pagina fără/cu add-on (înainte/după).

### Ca extensie Chrome
1. `chrome://extensions` → **Developer mode** → **Load unpacked** → folderul `extension/`.
2. Serverul trebuie să ruleze (`./run.sh`): extensia cheamă `http://127.0.0.1:8000`.
3. Debifează „Add-on activ” din pagină: coloana apare oricum, injectată de extensie.

## API
| Endpoint | Ce face |
|---|---|
| `POST /api/verify` | Verifică o factură `{cui, nr, furnizor?, total?}` și întoarce decizia + motivele |
| `POST /api/verify-batch` | La fel, pentru mai multe facturi, cu o singură interogare ANAF |
| `POST /api/upload-efactura` | Primește un XML e-Factura (UBL/CIUS-RO), îl citește și îl verifică |
| `GET /api/anaf/{cui}` | Datele live de la ANAF pentru un CUI |

## Ce verifică
| # | Verificare | Sursă | Dacă pică |
|---|---|---|---|
| 1 | Factura există în SPV (e-Factura) | SPV (simulat) | 🔴 |
| 2 | IBAN valid și identic cu cel din contract / plățile anterioare | contract, istoric | 🔴 |
| 3 | CUI valid (cifra de control), există la ANAF, nu e inactiv/radiat, numele corespunde, TVA justificat | **ANAF live** | 🔴 |
| 4 | Firma nu e înființată recent (< 180 zile) | **ANAF live** | 🟡 |
| 5 | Există contract | contracte | 🟡 |
| 6 | Prețuri conform contractului (diferența în lei) | contract | 🟡 |
| 7 | Nu e dublură (număr deja plătit / aceeași sumă recent) | istoric plăți | 🔴 / 🟡 |
| 8 | Sumă obișnuită față de media ultimelor 6 facturi | istoric plăți | 🟡 |
| 9 | Dovadă de livrare (aviz, PV, CMR) | documente | 🟡 |
| 10 | Numele nu imită un furnizor cunoscut cu alt CUI | contracte | 🔴 |

Orice 🔴 înseamnă **Blochează**, orice 🟡 înseamnă **Verifică**, altfel **Plătește**.

Acțiuni declanșate:
- butonul „Plătește” al soft-ului e interceptat: blocat pentru 🔴, confirmare pentru 🟡;
- „Exportă plăți aprobate” generează CSV-ul pentru bancă doar cu facturile aprobate, cu IBAN-ul **din contract**.

## Scenariul de demo
Furnizorii au **CUI-uri reale**, verificate live la ANAF. Contractele, IBAN-urile și istoricul plăților sunt date de test.

| Factură | Ce arată |
|---|---|
| DI-2026-0412 „DANTE INTERNATIONAL S.R.L.” | Frauda Facebook/Google: imită furnizorul real (eMAG), CUI inexistent la ANAF, nu e în SPV, IBAN din Letonia |
| PTR-5521 OMV Petrom | IBAN schimbat față de contract („ne-am schimbat contul”) |
| DED-1187 Dedeman | Dublură, deja plătită pe 28.09 |
| ORN-7781203 Orange | +151,25 lei peste prețul din contract |
| EF-2026-10-778 Electrica | Sumă de 3× media |
| ALX-2026-55871 Altex | Furnizor nou, fără contract și fără PV |
| DG-88213, DED-1203, DI-10233 | În regulă: Plătește |

Live, în fața juriului:
- **Verifică CUI la ANAF**: introduceți orice CUI real (ex. al firmei unui juriu);
- **Verifică XML e-Factura**: încărcați `samples/factura-frauda-dante.xml` sau `samples/factura-ok-digi.xml`.

## Structură
- `index.html`, `app/`: soft-ul de facturare simulat (nu știe nimic de add-on)
- `extension/addon.js`: citește tabelul din DOM, adaugă coloana, panoul de detalii, blocarea plății, exportul
- `backend/main.py`: API-ul FastAPI
- `backend/rules.py`: regulile de verificare
- `backend/anaf.py`: clientul ANAF (cache pe disc 6 ore, max. 1 cerere/secundă)
- `backend/efactura.py`: citirea XML-ului e-Factura
- `backend/seed.py`: date de test (contracte, plăți, SPV, documente, facturi)
- `samples/`: facturi XML de test (`python -m backend.make_samples` le regenerează)

## Ce e simulat
- **SPV**: accesul la e-Factura cere certificat digital, deci lista facturilor din SPV e în `seed.py`.
- **Contractele**: în produs, termenii (prețuri, IBAN, contact) se extrag cu AI din PDF-ul contractului. Deciziile rămân reguli explicabile.

## Cum lucrăm în echipă
1. `git clone` repo-ul, apoi o ramură nouă pentru fiecare funcționalitate: `git checkout -b nume-funcționalitate`.
2. Commit, `git push -u origin nume-funcționalitate`, apoi deschideți un Pull Request pe GitHub.
3. Unde adăugați lucruri:
   - o verificare nouă → `backend/rules.py` (în `verify_invoice`) + date de test în `backend/seed.py`;
   - facturi noi în listă → `app/app-data.js` **și** detaliile lor în `backend/seed.py` (`FACTURI`);
   - aspectul coloanei / panoului → `extension/addon.css`, `extension/addon.js`.
