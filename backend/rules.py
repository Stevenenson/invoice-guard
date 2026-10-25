"""Motorul de verificare: reguli clare, explicabile.

Fiecare verificare întoarce {id, titlu, status: ok | galben | rosu | na, detalii, scurt, sursa}.
Orice „rosu” => BLOCHEAZA, orice „galben” => VERIFICA, altfel PLATESTE.
"""
from __future__ import annotations

import re
import unicodedata
from datetime import date
from typing import Dict, List, Optional

from .anaf import Lookup

TARI = {"LV": "Letonia", "LT": "Lituania", "EE": "Estonia", "BG": "Bulgaria", "HU": "Ungaria", "CY": "Cipru",
        "GB": "Marea Britanie", "DE": "Germania", "PL": "Polonia", "NL": "Olanda"}
BANCI = {"BTRL": "Banca Transilvania", "INGB": "ING Bank", "BRDE": "BRD", "RNCB": "BCR", "BACX": "UniCredit",
         "CECE": "CEC Bank", "RZBR": "Raiffeisen", "TREZ": "Trezorerie"}
STOP = {"srl", "sa", "s", "r", "l", "a", "pfa", "ii", "snc", "sca"}


def lei(n: float) -> str:
    return f"{n:,.2f}".replace(",", " ").replace(".", ",").replace(" ", ".") + " lei"


def data_ro(s: str) -> str:
    return ".".join(reversed(s.split("-")))


def days_between(a: str, b: date) -> int:
    return (b - date.fromisoformat(a)).days


def name_tokens(s: str) -> List[str]:
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    return [t for t in re.sub(r"[^a-z0-9 ]", " ", s).split() if t not in STOP]


def norm_name(s: str) -> str:
    return "".join(name_tokens(s))


def similar_names(known: str, other: str) -> bool:
    """Aproape identice („Computer” vs „Computers”) sau numele cunoscut e cuprins în cel nou („Dedeman” în „Dedeman Distributie”)."""
    a, b = norm_name(known), norm_name(other)
    if levenshtein(a, b) <= 2:
        return True
    return set(name_tokens(known)) <= set(name_tokens(other))


def levenshtein(a: str, b: str) -> int:
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


def cui_valid(cui: str) -> bool:
    """Cifra de control a CUI-ului (cheia 753217532)."""
    if not cui.isdigit() or not 2 <= len(cui) <= 10:
        return False
    s = sum(int(a) * int(b) for a, b in zip(cui[:-1].zfill(9), "753217532")) * 10 % 11
    return (0 if s == 10 else s) == int(cui[-1])


def iban_valid(iban: str) -> bool:
    s = iban.replace(" ", "").upper()
    if not re.fullmatch(r"[A-Z]{2}\d{2}[A-Z0-9]{10,30}", s):
        return False
    return int("".join(str(int(ch, 36)) for ch in s[4:] + s[:4])) % 97 == 1


def iban_info(iban: str) -> str:
    if not iban.startswith("RO"):
        return "cont din " + TARI.get(iban[:2], iban[:2])
    return BANCI.get(iban[4:8], "bancă necunoscută")


def iban_scurt(iban: str) -> str:
    return iban[:8] + "…" + iban[-4:]


def _check(id_, titlu, status, detalii, scurt=None, sursa=None, **extra):
    return {"id": id_, "titlu": titlu, "status": status, "detalii": detalii, "scurt": scurt, "sursa": sursa, **extra}


def verify_invoice(inv: dict, anaf: Lookup, db) -> dict:
    key = f"{inv['cui']}|{inv['nr']}"
    linii = inv.get("linii", [])
    net = sum(l["cant"] * l["pret"] for l in linii)
    vat = sum(l["cant"] * l["pret"] * l.get("tva", 0) / 100 for l in linii)
    total = inv.get("total") or round(net + vat, 2)
    has_vat = any(l.get("tva", 0) > 0 for l in linii)
    contract = db.CONTRACTE.get(inv["cui"])
    istoric = sorted((p for p in db.PLATI if p["cui"] == inv["cui"]), key=lambda p: p["data"])
    info, anaf_status, anaf_at = anaf
    checks: List[dict] = []

    # 1. Există în SPV
    if key in db.SPV:
        checks.append(_check("spv", "Factura există în SPV (e-Factura)", "ok",
                             f"Găsită în SPV pentru CUI {db.FIRMA['cui']}.", sursa="SPV (simulat)"))
    else:
        canal = "e-mail (PDF)" if inv.get("sursa") == "E-mail" else "alt canal"
        checks.append(_check("spv", "Factura există în SPV (e-Factura)", "rosu",
                             f"Factura a venit pe {canal} și nu apare în SPV pentru CUI {db.FIRMA['cui']}. "
                             "Între firme, factura legală este XML-ul din e-Factura.", "Nu e în SPV", "SPV (simulat)"))

    # 2. IBAN
    iban = inv.get("iban")
    known = [x for x in dict.fromkeys([contract and contract["iban"]] + [p["iban"] for p in istoric]) if x]
    t = "IBAN conform contractului"
    if not iban:
        checks.append(_check("iban", t, "na", "Factura nu conține IBAN."))
    elif not iban_valid(iban):
        checks.append(_check("iban", t, "rosu", f"IBAN-ul {iban} nu este valid (cifrele de control nu se potrivesc).", "IBAN invalid"))
    elif iban in known:
        checks.append(_check("iban", t, "ok", f"{iban_scurt(iban)} ({iban_info(iban)}): același cont ca în contract și în plățile anterioare.",
                             sursa="contract + istoric plăți"))
    elif known:
        checks.append(_check("iban", t, "rosu", f"IBAN-ul de pe factură {iban_scurt(iban)} ({iban_info(iban)}) diferă de cel din contract "
                             f"{iban_scurt(known[0])} ({iban_info(known[0])}).", "IBAN schimbat", "contract + istoric plăți"))
    elif not iban.startswith("RO"):
        checks.append(_check("iban", t, "rosu", f"IBAN {iban_scurt(iban)}: {iban_info(iban)}. Furnizor fără contract și fără plăți anterioare.",
                             "IBAN străin"))
    else:
        checks.append(_check("iban", t, "galben", f"IBAN {iban_scurt(iban)} ({iban_info(iban)}): nu avem contract sau plăți anterioare "
                             "cu care să-l comparăm.", "IBAN nou"))

    # 3. ANAF (live)
    t, src = "Firmă activă la ANAF", "ANAF (simulat pentru demo)" if anaf_status == "simulat" else "ANAF (live)"
    if not cui_valid(inv["cui"]):
        checks.append(_check("anaf", t, "rosu", f"CUI {inv['cui']} este invalid: cifra de control nu se potrivește.", "CUI invalid", "algoritm CUI"))
    elif anaf_status == "unavailable":
        checks.append(_check("anaf", t, "galben", "ANAF nu răspunde momentan și nu avem o verificare anterioară. Reîncercați.",
                             "ANAF indisponibil", src))
    elif anaf_status == "not_found":
        checks.append(_check("anaf", t, "rosu", f"CUI {inv['cui']} nu există în registrul ANAF. Firma de pe factură nu există.",
                             "CUI inexistent", src))
    elif info["radiat"]:
        checks.append(_check("anaf", t, "rosu", f"{info['denumire']} este radiată din {data_ro(info['data_radiere'])}.", "Firmă radiată", src))
    elif info["inactiv"]:
        checks.append(_check("anaf", t, "rosu", f"{info['denumire']} este declarată inactivă fiscal"
                             f"{' din ' + data_ro(info['data_inactivare']) if info['data_inactivare'] else ''}. "
                             "TVA-ul de pe facturile de la contribuabili inactivi nu este deductibil.", "Firmă inactivă", src))
    elif norm_name(info["denumire"]) != norm_name(inv["furnizor"]):
        checks.append(_check("anaf", t, "rosu", f"Pe factură scrie „{inv['furnizor']}”, dar CUI {inv['cui']} aparține firmei "
                             f"„{info['denumire']}”.", "Nume ≠ CUI", src))
    elif not info["tva"] and has_vat:
        checks.append(_check("anaf", t, "rosu", f"Factura are TVA, dar {info['denumire']} nu e înregistrată în scopuri de TVA.",
                             "TVA nejustificat", src))
    else:
        checks.append(_check("anaf", t, "ok", f"{info['denumire']}: activă, {'plătitoare' if info['tva'] else 'neplătitoare'} de TVA, "
                             f"{info['nr_reg_com']}.", sursa=src))
    if info and info.get("data_inregistrare"):
        age = days_between(info["data_inregistrare"], date.today())
        if age < 180:
            checks.append(_check("vechime", "Vechimea firmei", "galben",
                                 f"Înregistrată pe {data_ro(info['data_inregistrare'])} (acum {age} de zile).", "Firmă nouă", src))

    # 4. Contract
    if contract:
        checks.append(_check("contract", "Contract cu furnizorul", "ok", f"Contract {contract['nr']} din {data_ro(contract['data'])}.",
                             sursa="contracte"))
    else:
        checks.append(_check("contract", "Contract cu furnizorul", "galben", "Nu avem contract încărcat cu acest furnizor (furnizor nou).",
                             "Fără contract", "contracte"))

    # 5. Prețuri
    t = "Prețuri conform contractului"
    if contract and linii:
        probleme, diferenta = [], 0.0
        for l in linii:
            art = contract["articole"].get(l["cod"])
            if not art:
                probleme.append(f"„{l['denumire']}” nu apare în contract")
            elif l["pret"] > art["pret"]:
                d = (l["pret"] - art["pret"]) * l["cant"] * (1 + l.get("tva", 0) / 100)
                diferenta += d
                probleme.append(f"„{l['denumire']}”: {lei(l['pret'])}/{art['um']} facturat vs. {lei(art['pret'])}/{art['um']} "
                                f"în contract (+{lei(d)} cu TVA)")
        if probleme:
            scurt = "+" + lei(round(diferenta, 2)).replace(",00", "") if diferenta else "Articol nou"
            checks.append(_check("pret", t, "galben", "; ".join(probleme) + ".", scurt, "contract", diferenta=round(diferenta, 2)))
        else:
            checks.append(_check("pret", t, "ok", "Toate liniile au prețul din contract.", sursa="contract"))
    else:
        checks.append(_check("pret", t, "na", "Nu există contract cu care să comparăm."))

    # 6. Dublură
    t = "Nu e dublură"
    platita = next((p for p in istoric if p["nr"] == inv["nr"]), None)
    aceeasi = None
    if not (contract and contract["recurent"]):
        aceeasi = next((p for p in istoric if p["nr"] != inv["nr"] and abs(p["total"] - total) < 0.01
                        and days_between(p["data"], db.AZI) <= 35), None)
    if platita:
        checks.append(_check("dublura", t, "rosu", f"Factura {inv['nr']} a fost deja plătită pe {data_ro(platita['data'])} "
                             f"({lei(platita['total'])}).", "Dublură", "istoric plăți", platita_pe=platita["data"]))
    elif aceeasi:
        checks.append(_check("dublura", t, "galben", f"Aceeași sumă ({lei(total)}) a fost plătită pe {data_ro(aceeasi['data'])} "
                             f"pentru factura {aceeasi['nr']}.", "Posibilă dublură", "istoric plăți"))
    else:
        checks.append(_check("dublura", t, "ok", "Număr și sumă unice în istoricul plăților.", sursa="istoric plăți"))

    # 7. Sumă neobișnuită
    t = "Sumă obișnuită pentru furnizor"
    last = istoric[-6:]
    if len(last) >= 3:
        medie = sum(p["total"] for p in last) / len(last)
        raport = total / medie
        if raport >= 2:
            checks.append(_check("suma", t, "galben", f"{lei(total)} este de {raport:.1f}× media ultimelor {len(last)} facturi "
                                 f"({lei(round(medie, 2))}).", f"{raport:.1f}× media", "istoric plăți"))
        else:
            checks.append(_check("suma", t, "ok", f"În linie cu media ultimelor facturi ({lei(round(medie, 2))}).", sursa="istoric plăți"))
    else:
        checks.append(_check("suma", t, "na", "Istoric insuficient."))

    # 8. Nume asemănător cu un furnizor cunoscut, dar alt CUI (frauda „Quanta”)
    sosie = next((
        {"cui": cui, "nume": c["denumire"]} for cui, c in db.CONTRACTE.items()
        if cui != inv["cui"] and similar_names(c["denumire"], inv["furnizor"])
    ), None)
    if sosie:
        checks.append(_check("sosie", "Nu imită un furnizor cunoscut", "rosu",
                             f"„{inv['furnizor']}” (CUI {inv['cui']}) seamănă cu furnizorul vostru „{sosie['nume']}” "
                             f"(CUI {sosie['cui']}), dar CUI-ul e diferit.", "Nume clonat", "contracte", sosie=sosie))
    else:
        checks.append(_check("sosie", "Nu imită un furnizor cunoscut", "ok", "Niciun furnizor cu nume asemănător.", sursa="contracte"))

    rosii = [c for c in checks if c["status"] == "rosu"]
    galbene = [c for c in checks if c["status"] == "galben"]
    decizie = "BLOCHEAZA" if rosii else "VERIFICA" if galbene else "PLATESTE"
    scor = min(100, len(rosii) * 35 + len(galbene) * 12 + (3 if decizie == "PLATESTE" else 0))

    return {
        "key": key, "factura": inv["nr"], "furnizor": inv["furnizor"], "cui": inv["cui"], "total": total,
        "sursa": inv.get("sursa", "necunoscută"), "iban": iban,
        "iban_plata": contract["iban"] if contract else (istoric[-1]["iban"] if istoric else None),
        "contract": contract, "linii": linii,
        "decizie": decizie, "scor_risc": scor,
        "motive": [{"nivel": c["status"], "text": c["detalii"], "scurt": c["scurt"]} for c in rosii + galbene],
        "verificari": checks,
        "actiune_recomandata": _recommend(checks, contract, db),
        "anaf": {"status": anaf_status, "interogat_la": anaf_at, "date": info},
    }


def _recommend(checks: List[dict], contract: Optional[dict], db) -> str:
    by: Dict[str, dict] = {c["id"]: c for c in checks}
    if by["sosie"]["status"] == "rosu":
        s = by["sosie"]["sosie"]
        return (f"Nu plătiți. Sunați la {s['nume']} la numărul din contract ({db.CONTRACTE[s['cui']]['telefon']}) și întrebați "
                "dacă au emis factura. Cel mai probabil e o tentativă de fraudă.")
    if by["dublura"]["status"] == "rosu":
        return f"Nu plătiți: factura a fost deja achitată pe {data_ro(by['dublura']['platita_pe'])}. Arhivați-o ca dublură."
    if by["iban"]["status"] == "rosu" and contract:
        return (f"Sunați la {contract['persoana']}, la numărul din contract ({contract['telefon']}), nu la cel de pe factură "
                "sau din e-mail, și confirmați schimbarea contului.")
    if by["anaf"]["status"] == "rosu":
        return "Nu plătiți până nu clarificați situația fiscală a furnizorului."
    if by["spv"]["status"] == "rosu":
        return "Cereți furnizorului să transmită factura prin e-Factura. Nu plătiți facturi care nu sunt în SPV."
    if by["pret"]["status"] == "galben" and by["pret"].get("diferenta"):
        return (f"Cereți o factură de stornare pentru diferența de {lei(by['pret']['diferenta'])} sau aprobați manual "
                "dacă există un act adițional.")
    if by["suma"]["status"] == "galben":
        return "Comparați consumul cu luna anterioară. Dacă e corect, aprobați manual."
    if by["contract"]["status"] == "galben":
        return "Furnizor nou: încărcați contractul sau comanda și aprobați manual."
    if by["anaf"]["status"] == "galben":
        return "Reîncercați verificarea ANAF înainte de plată."
    return "Totul e în regulă. Factura poate fi inclusă în fișierul de plăți."
