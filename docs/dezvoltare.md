# InvoiceGuard: pentru dezvoltatori

Tot ce nu ține de folosirea aplicației desktop: demo-ul web, extensia Chrome, API-ul, structura codului și lucrul în echipă.
Pentru aplicația desktop, vezi [README](../README.md).

## Demo-ul web și extensia Chrome

Pagina `index.html` simulează lista „Facturi primite” dintr-un soft de facturare online.
Add-on-ul (`extension/`) adaugă coloana **Verificare** fără să modifice codul paginii, exact cum ar face o extensie Chrome
peste soft-ul real. Verificările le face același API Python (`backend/`).

### Pornire

Ai nevoie de Python 3.9 sau mai nou (`python3 --version`).

- **macOS**: dublu-click pe `InvoiceGuard Web.command` (sau `./run.sh` în Terminal).
- **Linux**: `./run.sh`
- **Windows**: dublu-click pe `run.bat` (Python 3.12 sau 3.13, cu „Add python.exe to PATH”).

Apoi deschide:
- **http://127.0.0.1:8000**: demo-ul (soft-ul de facturare simulat + add-on-ul)
- **http://127.0.0.1:8000/docs**: documentația API (Swagger), unde poți încerca fiecare endpoint

Comutatorul **Add-on activ** din stânga-jos arată pagina fără/cu add-on (înainte/după).

### Ca extensie Chrome (demo și SAGA WEB)
1. `chrome://extensions` → **Developer mode** → **Load unpacked** → folderul `extension/`.
2. Serverul trebuie să ruleze (`./run.sh`). Iconița extensiei arată dacă API-ul e pornit.
3. Extensia rulează pe demo și pe **SAGA WEB** (`https://web.sagasoft.ro`). Pentru demo din fișier local: la extensie, **Details** → **Allow access to file URLs**.

Cum găsește lista de facturi: caută tabelele după titlurile coloanelor, fără diacritice și cu sinonime (`HEADERS` în `addon.js`). Un tabel e luat în seamă doar dacă are **număr, furnizor și CUI**, ca să nu atingă facturile emise. Coloana se pune înainte de „Acțiuni”/„Operații”, iar facturile „Achitat”/„Plătită” sunt sărite.

Cererile către API trec prin `background.js`: o pagină `https` ca SAGA WEB nu are voie să apeleze direct `127.0.0.1`.

**SAGA WEB, neverificat încă:** n-am avut un cont SAGA WEB, deci titlurile reale ale coloanelor din lista de facturi primite nu sunt confirmate. Dacă coloana „Verificare” nu apare:
1. intrați în SAGA WEB pe pagina cu facturile primite;
2. iconița InvoiceGuard → **Diagnostic** → **Copiază**;
3. trimiteți raportul: arată tabelele găsite și coloanele lor, iar sinonimele lipsă se adaugă în `HEADERS`.

În SAGA WEB nu interceptăm încă butonul de plată (`payButton: null` în `SITES`); restul (coloana, panoul, ANAF, exportul) funcționează la fel ca în demo. Înainte de o lansare reală, extensia trebuie verificată cu termenii de utilizare SAGA.

În demo, butonul „Plătește” al soft-ului e interceptat: blocat pentru 🔴, confirmare pentru 🟡.

### Scenariul demo-ului web

| Factură | Ce arată |
|---|---|
| DI-2026-0412 „DANTE INTERNATIONAL S.R.L.” | Frauda Facebook/Google: imită furnizorul real (eMAG), CUI inexistent la ANAF, nu e în SPV, IBAN din Letonia |
| DD-2026-0107 „DEDEMAN DISTRIBUTIE SRL” | Frauda C: firmă (fictivă) care există la ANAF și trimite **corect prin SPV**, dar imită furnizorul Dedeman. Arată de ce SPV nu e suficient. |
| PTR-5521 OMV Petrom | IBAN schimbat față de contract („ne-am schimbat contul”) |
| DED-1187 Dedeman | Dublură, deja plătită pe 28.09 |
| ORN-7781203 Orange | +151,25 lei peste prețul din contract |
| EF-2026-10-778 Electrica | Sumă de 3× media |
| ALX-2026-55871 Altex | Furnizor nou, fără contract |
| DG-88213, DED-1203, DI-10233 | În regulă: Plătește |

Live, în fața juriului:
- **Verifică CUI la ANAF**: introduceți orice CUI real (ex. al firmei unui juriu);
- **Verifică XML e-Factura**: încărcați `samples/factura-frauda-dante.xml`, `samples/factura-frauda-c-dedeman-distributie.xml` sau `samples/factura-ok-digi.xml`.

## API

| Endpoint | Ce face |
|---|---|
| `POST /api/verify` | Verifică o factură `{cui, nr, furnizor?, total?}` și întoarce decizia + motivele |
| `POST /api/verify-batch` | La fel, pentru mai multe facturi, cu o singură interogare ANAF |
| `POST /api/upload-efactura` | Primește un XML e-Factura (UBL/CIUS-RO), îl citește și îl verifică |
| `GET /api/anaf/{cui}` | Datele live de la ANAF pentru un CUI |
| `GET /api/inbox` | Facturile din folderul urmărit, verificate (doar în aplicația desktop) |
| `POST /api/inbox/upload` | Adaugă o factură în folderul urmărit (trage-și-lasă) |
| `DELETE /api/inbox/{fisier}` | Scoate o factură din listă (fișierul se mută în `~/InvoiceGuard/Sterse`) |
| `DELETE /api/inbox` | Scoate toate facturile din listă (la fel, în `Sterse`) |
| `POST /api/inbox/export` | Salvează fișierul de plăți (CSV) pentru facturile aprobate |

## Structura codului

- `desktop/`: aplicația desktop (fereastra pywebview în `__main__.py` + pagina ei în `web/`)
- `backend/main.py`: API-ul FastAPI
- `backend/rules.py`: regulile de verificare, decizia și scorul
- `backend/anaf.py`: clientul ANAF (cache pe disc 6 ore, max. 1 cerere/secundă)
- `backend/efactura.py`: citirea XML-ului e-Factura
- `backend/inbox.py`, `backend/notify.py`: urmărirea folderului, exportul și notificările (aplicația desktop)
- `backend/seed.py`: date de test (contracte, plăți, SPV, facturi)
- `index.html`, `app/`: soft-ul de facturare simulat pentru demo-ul web (nu știe nimic de add-on)
- `extension/`: add-on-ul / extensia Chrome (`addon.js`, `background.js`, `popup.html`)
- `samples/`: facturi XML de test (`python -m backend.make_samples` le regenerează)

## Cum lucrăm în echipă
1. `git clone` repo-ul, apoi o ramură nouă pentru fiecare funcționalitate: `git checkout -b nume-funcționalitate`.
2. Commit, `git push -u origin nume-funcționalitate`, apoi deschideți un Pull Request pe GitHub.
3. Unde adăugați lucruri:
   - o verificare nouă → `backend/rules.py` (în `verify_invoice`) + date de test în `backend/seed.py`;
   - aspectul aplicației desktop → `desktop/web/`;
   - facturi noi în demo-ul web → `app/app-data.js` **și** detaliile lor în `backend/seed.py` (`FACTURI`);
   - aspectul coloanei / panoului din extensie → `extension/addon.css`, `extension/addon.js`.
