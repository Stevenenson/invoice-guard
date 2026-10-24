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

**Windows**: dublu-click pe `run.bat` (prima pornire instalează pachetele, durează 1–2 minute).
Necesită Python 3.12 sau 3.13 de pe [python.org](https://www.python.org/downloads/), cu „Add python.exe to PATH” bifat.

Apoi deschide:
- **http://127.0.0.1:8000**: demo-ul (soft-ul de facturare simulat + add-on-ul)
- **http://127.0.0.1:8000/docs**: documentația API (Swagger), unde poți încerca fiecare endpoint

Comutatorul **Add-on activ** din stânga-jos arată pagina fără/cu add-on (înainte/după).

### Aplicația desktop (lângă SAGA)
Pentru softurile desktop (SAGA, WinMentor), unde nu putem adăuga o coloană, InvoiceGuard rulează ca o fereastră mică, mereu deasupra.

```bash
./run-desktop.sh            # macOS / Linux
```
Pe Windows: dublu-click pe `run-desktop.bat`. Folderul urmărit e `C:\Users\<nume>\InvoiceGuard\Facturi`.

- Urmărește folderul `~/InvoiceGuard/Facturi`: contabilul salvează acolo facturile descărcate din SPV (XML sau arhiva ZIP), iar fiecare factură nouă e verificată în ~2 secunde.
- Facturile roșii declanșează o notificare de sistem (macOS: Centrul de notificări, Windows: balon în bara de sistem).
- O factură primită pe e-mail se trage în fereastră.
- „Exportă plăți aprobate” salvează CSV-ul în `~/InvoiceGuard/Plati`.
- Folderul se poate schimba cu variabila `INVOICEGUARD_INBOX`; serverul aplicației folosește portul 8765.

Limita: fereastra nu vede ce e selectat în SAGA. Lucrează pe facturile din folder, adică exact cele care urmează să intre în SAGA.

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

## API
| Endpoint | Ce face |
|---|---|
| `POST /api/verify` | Verifică o factură `{cui, nr, furnizor?, total?}` și întoarce decizia + motivele |
| `POST /api/verify-batch` | La fel, pentru mai multe facturi, cu o singură interogare ANAF |
| `POST /api/upload-efactura` | Primește un XML e-Factura (UBL/CIUS-RO), îl citește și îl verifică |
| `GET /api/anaf/{cui}` | Datele live de la ANAF pentru un CUI |
| `GET /api/inbox` | Facturile din folderul urmărit, verificate (doar în aplicația desktop) |
| `POST /api/inbox/upload` | Adaugă o factură în folderul urmărit (trage-și-lasă) |
| `POST /api/inbox/export` | Salvează fișierul de plăți pentru facturile aprobate |

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
| 10 | Numele nu imită un furnizor cunoscut cu alt CUI (aproape identic sau îl conține: „Dedeman Distributie”) | contracte | 🔴 |

Orice 🔴 înseamnă **Blochează**, orice 🟡 înseamnă **Verifică**, altfel **Plătește**.

Acțiuni declanșate:
- butonul „Plătește” al soft-ului e interceptat: blocat pentru 🔴, confirmare pentru 🟡;
- „Exportă plăți aprobate” generează CSV-ul pentru bancă doar cu facturile aprobate, cu IBAN-ul **din contract**.

## Scenariul de demo
Furnizorii au **CUI-uri reale**, verificate live la ANAF. Contractele, IBAN-urile și istoricul plăților sunt date de test.
Excepție: firmele escrocilor sunt fictive, ca să nu prezentăm o firmă reală drept fraudă. Pentru „DEDEMAN DISTRIBUTIE SRL” răspunsul ANAF e simulat (`ANAF_SIMULAT` în `seed.py`) și apare marcat „SIMULAT” în panou.

| Factură | Ce arată |
|---|---|
| DI-2026-0412 „DANTE INTERNATIONAL S.R.L.” | Frauda Facebook/Google: imită furnizorul real (eMAG), CUI inexistent la ANAF, nu e în SPV, IBAN din Letonia |
| DD-2026-0107 „DEDEMAN DISTRIBUTIE SRL” | Frauda C: firmă (fictivă) care există la ANAF și trimite **corect prin SPV**, dar imită furnizorul Dedeman. Arată de ce SPV nu e suficient. |
| PTR-5521 OMV Petrom | IBAN schimbat față de contract („ne-am schimbat contul”) |
| DED-1187 Dedeman | Dublură, deja plătită pe 28.09 |
| ORN-7781203 Orange | +151,25 lei peste prețul din contract |
| EF-2026-10-778 Electrica | Sumă de 3× media |
| ALX-2026-55871 Altex | Furnizor nou, fără contract și fără PV |
| DG-88213, DED-1203, DI-10233 | În regulă: Plătește |

Live, în fața juriului:
- **Verifică CUI la ANAF**: introduceți orice CUI real (ex. al firmei unui juriu);
- **Verifică XML e-Factura**: încărcați `samples/factura-frauda-dante.xml`, `samples/factura-frauda-c-dedeman-distributie.xml` sau `samples/factura-ok-digi.xml`.

## Structură
- `index.html`, `app/`: soft-ul de facturare simulat (nu știe nimic de add-on)
- `extension/addon.js`: citește tabelul din DOM, adaugă coloana, panoul de detalii, blocarea plății, exportul
- `extension/background.js`, `popup.html`: cererile către API și fereastra extensiei (stare API, diagnostic)
- `backend/main.py`: API-ul FastAPI
- `backend/rules.py`: regulile de verificare
- `backend/anaf.py`: clientul ANAF (cache pe disc 6 ore, max. 1 cerere/secundă)
- `backend/efactura.py`: citirea XML-ului e-Factura
- `backend/inbox.py`, `backend/notify.py`: urmărirea folderului și notificările (aplicația desktop)
- `desktop/`: aplicația desktop (fereastra pywebview + pagina ei)
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
