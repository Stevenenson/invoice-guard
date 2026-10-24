"""Datele firmei care folosește InvoiceGuard: contracte, plăți, documente, SPV.

Furnizorii au CUI-uri REALE (verificate live la ANAF). Contractele, IBAN-urile și istoricul
plăților sunt date de test: în produs le încarcă firma (contracte PDF, extrase bancare).
"""
from __future__ import annotations

from datetime import date


def iban(country: str, bank: str, account: str) -> str:
    """Construiește un IBAN cu cifre de control corecte (mod 97)."""
    rearranged = bank + account + country + "00"
    num = int("".join(str(int(ch, 36)) for ch in rearranged))
    return f"{country}{98 - num % 97:02d}{bank}{account}"


AZI = date(2026, 10, 24)
FIRMA = {"nume": "Atelier Nord SRL", "cui": "40112233"}
COTA_TVA = 21.0

CONTRACTE = {
    "5888716": {"denumire": "DIGI ROMANIA S.A.", "nr": "C-14/2024", "data": "2024-01-10",
                "iban": iban("RO", "BTRL", "RONCRT0058887160"), "telefon": "031 400 4440", "persoana": "Departament firme",
                "recurent": True, "livrare_necesara": False,
                "articole": {"INT-500": {"denumire": "Abonament internet 500 Mbps", "um": "lună", "pret": 372}}},
    "9010105": {"denumire": "ORANGE ROMANIA SA", "nr": "C-03/2025", "data": "2025-02-01",
                "iban": iban("RO", "INGB", "0000999990101050"), "telefon": "0744 300 300", "persoana": "Account manager business",
                "recurent": True, "livrare_necesara": False,
                "articole": {"ABO-BIZ": {"denumire": "Abonament mobil business", "um": "linie", "pret": 40}}},
    "14399840": {"denumire": "DANTE INTERNATIONAL SA", "nr": "C-21/2023", "data": "2023-06-15",
                 "iban": iban("RO", "BRDE", "445SV14399840001"), "telefon": "021 200 5200", "persoana": "Vânzări B2B",
                 "recurent": False, "livrare_necesara": True,
                 "articole": {"MON-27": {"denumire": 'Monitor 27"', "um": "buc", "pret": 780},
                              "LAP-15": {"denumire": 'Laptop 15"', "um": "buc", "pret": 3100}}},
    "2816464": {"denumire": "DEDEMAN SRL", "nr": "C-08/2022", "data": "2022-03-01",
                "iban": iban("RO", "RNCB", "0090000028164640"), "telefon": "0234 513 330", "persoana": "Vânzări firme",
                "recurent": False, "livrare_necesara": True,
                "articole": {"VOP-15L": {"denumire": "Vopsea lavabilă albă 15 L", "um": "buc", "pret": 95},
                             "BORM-18V": {"denumire": "Mașină de înșurubat 18V", "um": "buc", "pret": 310}}},
    "28909028": {"denumire": "ELECTRICA FURNIZARE SA", "nr": "C-01/2024", "data": "2024-01-01",
                 "iban": iban("RO", "BACX", "0000004428909028"), "telefon": "0800 500 000", "persoana": "Relații clienți",
                 "recurent": True, "livrare_necesara": False,
                 "articole": {"EN-KWH": {"denumire": "Energie electrică", "um": "kWh", "pret": 0.92}}},
    "1590082": {"denumire": "OMV PETROM SA", "nr": "C-11/2025", "data": "2025-05-20",
                "iban": iban("RO", "CECE", "B0003RON01590082"), "telefon": "021 406 4000", "persoana": "Carduri flotă",
                "recurent": False, "livrare_necesara": True,
                "articole": {"MOTORINA": {"denumire": "Motorină (card flotă)", "um": "l", "pret": 6.00}}},
}

# Firme fictive pentru scenariile de fraudă care trec de ANAF. Nu folosim firme reale, ca să nu
# prezentăm o firmă nevinovată drept escroc. Răspunsul ANAF pentru ele e simulat și marcat ca atare.
ANAF_SIMULAT = {
    "59880010": {"cui": "59880010", "denumire": "DEDEMAN DISTRIBUTIE SRL", "adresa": "JUD. ILFOV, OTOPENI, STR. EXEMPLU NR. 1 (fictiv)",
                 "nr_reg_com": "J2026000000000 (fictiv)", "data_inregistrare": "2026-08-20", "cod_caen": "4673",
                 "tva": True, "inactiv": False, "data_inactivare": "", "radiat": False, "data_radiere": "", "e_factura": True},
}

# Ce facturi există în SPV (e-Factura) pentru CUI-ul nostru. Simulat: accesul real cere certificat digital.
SPV = {
    "59880010|DD-2026-0107",
    "5888716|DG-88213", "5888716|DG-87102", "5888716|DG-89001", "9010105|ORN-7781203",
    "14399840|DI-10233", "2816464|DED-1203", "2816464|DED-1187", "28909028|EF-2026-10-778",
    "1590082|PTR-5521", "2864518|ALX-2026-55871",
}

# Facturile de test din samples/teste (python -m backend.make_samples): cele care „au venit prin SPV”.
SPV |= {
    "5888716|DG-90101", "9010105|ORN-7790001", "28909028|EF-2026-11-801", "14399840|DI-10301", "2816464|DED-1240",
    "9010105|ORN-7790002", "2816464|DED-1170",
    "5888716|DG-90102", "28909028|EF-2026-11-802", "2864518|ALX-2026-60010", "14399840|DI-10302", "2816464|DED-1241",
}

DOCUMENTE = {
    "14399840|DI-10301": [{"tip": "Aviz de însoțire", "nr": "AV-5601"}],
    "2816464|DED-1240": [{"tip": "Aviz de însoțire", "nr": "AV-930"}],
    "2816464|DED-1170": [{"tip": "Aviz de însoțire", "nr": "AV-850"}],
    "2816464|DED-1241": [{"tip": "Aviz de însoțire", "nr": "AV-931"}],
    "14399840|DI-10233": [{"tip": "Aviz de însoțire", "nr": "AV-5512"}],
    "2816464|DED-1203": [{"tip": "Aviz de însoțire", "nr": "AV-901"}],
    "2816464|DED-1187": [{"tip": "Aviz de însoțire", "nr": "AV-874"}],
    "1590082|PTR-5521": [{"tip": "Raport tranzacții card", "nr": "RT-10-2026"}],
}

# Istoric plăți aprilie–septembrie 2026: (cui, prefix, start, pas, zero-padding, sume fără TVA)
_ISTORIC = [
    ("5888716", "DG-", 82002, 1020, 0, [372, 372, 372, 372, 372, 372]),
    ("9010105", "ORN-", 7775103, 1200, 0, [1000, 1000, 1000, 1000, 1000, 1000]),
    ("14399840", "DI-", 9800, 70, 0, [1560, 3900, 2340, 4680, 1560, 3120]),
    ("2816464", "DED-", 1102, 17, 0, [2850, 3420, 2280, 3990, 3040, 3800]),
    ("28909028", "EF-2026-", 4, 1, 2, [2208, 2392, 2116, 2484, 2300, 2024]),
    ("1590082", "PTR-", 5390, 22, 0, [3600, 2400, 4800, 2400, 3600, 2400]),
]
PLATI = [
    {"cui": cui, "nr": prefix + str(start + i * step).zfill(pad), "data": f"2026-{4 + i:02d}-28",
     "total": round(net * (1 + COTA_TVA / 100), 2), "iban": CONTRACTE[cui]["iban"]}
    for cui, prefix, start, step, pad, nets in _ISTORIC
    for i, net in enumerate(nets)
]


def _l(cod, denumire, cant, pret, tva=COTA_TVA):
    return {"cod": cod, "denumire": denumire, "cant": cant, "pret": pret, "tva": tva}


# Detaliile facturilor primite (cum ar veni din XML-ul e-Factura sau din PDF-ul de pe e-mail).
FACTURI = [
    {"cui": "5888716", "nr": "DG-88213", "furnizor": "DIGI ROMANIA S.A.", "sursa": "SPV", "iban": CONTRACTE["5888716"]["iban"],
     "linii": [_l("INT-500", "Abonament internet 500 Mbps – oct. 2026", 1, 372)]},
    {"cui": "9010105", "nr": "ORN-7781203", "furnizor": "ORANGE ROMANIA SA", "sursa": "SPV", "iban": CONTRACTE["9010105"]["iban"],
     "linii": [_l("ABO-BIZ", "Abonament mobil business – oct. 2026", 25, 45)]},
    {"cui": "59880002", "nr": "DI-2026-0412", "furnizor": "DANTE INTERNATIONAL S.R.L.", "sursa": "E-mail",
     "iban": iban("LV", "HABA", "0551043519501"),
     "linii": [_l("LAP-15", 'Laptop 15" i7 / 32GB', 12, 3300)]},
    {"cui": "2816464", "nr": "DED-1187", "furnizor": "DEDEMAN SRL", "sursa": "E-mail", "iban": CONTRACTE["2816464"]["iban"],
     "linii": [_l("VOP-15L", "Vopsea lavabilă albă 15 L", 40, 95)]},
    {"cui": "2816464", "nr": "DED-1203", "furnizor": "DEDEMAN SRL", "sursa": "SPV", "iban": CONTRACTE["2816464"]["iban"],
     "linii": [_l("VOP-15L", "Vopsea lavabilă albă 15 L", 20, 95), _l("BORM-18V", "Mașină de înșurubat 18V", 4, 310)]},
    {"cui": "28909028", "nr": "EF-2026-10-778", "furnizor": "ELECTRICA FURNIZARE SA", "sursa": "SPV", "iban": CONTRACTE["28909028"]["iban"],
     "linii": [_l("EN-KWH", "Energie electrică – sept. 2026", 7500, 0.92)]},
    {"cui": "1590082", "nr": "PTR-5521", "furnizor": "OMV PETROM SA", "sursa": "SPV", "iban": iban("RO", "BTRL", "RONCRT0099991111"),
     "linii": [_l("MOTORINA", "Motorină (card flotă) – oct. 2026", 600, 6.00)]},
    {"cui": "14399840", "nr": "DI-10233", "furnizor": "DANTE INTERNATIONAL SA", "sursa": "SPV", "iban": CONTRACTE["14399840"]["iban"],
     "linii": [_l("MON-27", 'Monitor 27"', 6, 780)]},
    # Frauda C: firmă înființată de escroc, cu nume asemănător, factură trimisă CORECT prin SPV.
    {"cui": "59880010", "nr": "DD-2026-0107", "furnizor": "DEDEMAN DISTRIBUTIE SRL", "sursa": "SPV",
     "iban": iban("RO", "BTRL", "RONCRT0059880010"),
     "linii": [_l("VOP-15L", "Vopsea lavabilă albă 15 L", 30, 92)]},
    {"cui": "2864518", "nr": "ALX-2026-55871", "furnizor": "ALTEX ROMANIA SRL", "sursa": "SPV", "iban": iban("RO", "BTRL", "RONCRT0028645180"),
     "linii": [_l("AC-12K", "Aer condiționat 12000 BTU", 1, 2450)]},
]
