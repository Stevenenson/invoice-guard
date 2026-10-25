# Facturi de test (15)

Numele fișierului spune rezultatul așteptat. Funcționează doar cu codul din același commit:
`backend/seed.py` știe că facturile „verzi” sunt în SPV.

| Fișier | Rezultat | De ce |
|---|---|---|
| verde-01-digi-internet | Plătește | Preț, IBAN și SPV conform |
| verde-02-orange-abonamente | Plătește | 25 linii × 40 lei, ca în contract |
| verde-03-electrica-energie | Plătește | Consum obișnuit |
| verde-04-emag-monitoare | Plătește | Preț din contract |
| verde-05-dedeman-materiale | Plătește | Preț din contract |
| rosu-06-digi-pe-email-nu-e-in-spv | Blochează | Furnizor real, dar factura nu e în SPV |
| rosu-07-orange-iban-schimbat | Blochează | IBAN diferit de contract („ne-am schimbat contul”) |
| rosu-08-dedeman-dublura-platita-in-august | Blochează | DED-1170 plătită deja pe 28.08.2026 |
| rosu-09-electrica-falsa-cui-invalid | Blochează | CUI cu cifră de control greșită, nume clonat, nu e în SPV |
| rosu-10-nume-petrom-cu-cui-altex | Blochează | Scrie „OMV PETROM SA”, dar CUI-ul e al Altex (verificat live la ANAF) |
| galben-11-digi-pret-peste-contract | Verifică | 399 lei în loc de 372 (+32,67 lei cu TVA) |
| galben-12-electrica-suma-de-3-ori-media | Verifică | 3,3× media ultimelor facturi |
| galben-13-altex-furnizor-nou-fara-contract | Verifică | Furnizor fără contract, IBAN nou |
| verde-14-emag-fara-aviz | Plătește | Fără aviz, dar dovada de livrare nu se mai verifică |
| galben-15-dedeman-articol-care-nu-e-in-contract | Verifică | „Scară aluminiu” nu apare în contract |

Se regenerează cu `python -m backend.make_samples`.
