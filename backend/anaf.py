"""Client pentru API-ul public ANAF (registrul plătitorilor de TVA), cu cache pe disc.

Documentație: https://static.anaf.ro/static/10/Anaf/Informatii_R/Servicii_web/doc_WS_V9.txt
Limite ANAF: max. 100 CUI-uri pe cerere, 1 cerere pe secundă.
"""
from __future__ import annotations

import json
import threading
import time
from datetime import date, datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import httpx

URL = "https://webservicesp.anaf.ro/api/PlatitorTvaRest/v9/tva"
CACHE_FILE = Path(__file__).parent / "data" / "anaf_cache.json"
TTL_SECONDS = 6 * 3600

# status: "ok" (găsit), "not_found" (CUI-ul nu există), "unavailable" (ANAF nu răspunde, fără cache)
Lookup = Tuple[Optional[dict], str, Optional[str]]  # (info, status, interogat_la)


def _parse(f: dict) -> dict:
    g = f["date_generale"]
    tva = f.get("inregistrare_scop_Tva") or {}
    ina = f.get("stare_inactiv") or {}
    return {
        "cui": str(g["cui"]),
        "denumire": g.get("denumire", ""),
        "adresa": g.get("adresa", ""),
        "nr_reg_com": g.get("nrRegCom", ""),
        "data_inregistrare": g.get("data_inregistrare", ""),
        "cod_caen": g.get("cod_CAEN", ""),
        "tva": bool(tva.get("scpTVA")),
        "inactiv": bool(ina.get("statusInactivi")),
        "data_inactivare": ina.get("dataInactivare", ""),
        "radiat": bool(ina.get("dataRadiere")),
        "data_radiere": ina.get("dataRadiere", ""),
        "e_factura": bool(g.get("statusRO_e_Factura")),
    }


class AnafClient:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._last_call = 0.0
        self._cache: Dict[str, dict] = {}
        if CACHE_FILE.exists():
            try:
                self._cache = json.loads(CACHE_FILE.read_text(encoding="utf-8"))
            except ValueError:
                self._cache = {}

    def lookup(self, cuis: List[str]) -> Dict[str, Lookup]:
        cuis = list(dict.fromkeys(c for c in cuis if c.isdigit()))
        now = time.time()
        need = [c for c in cuis if c not in self._cache or now - self._cache[c]["ts"] > TTL_SECONDS]
        for i in range(0, len(need), 100):
            self._fetch(need[i:i + 100])

        out: Dict[str, Lookup] = {}
        for c in cuis:
            entry = self._cache.get(c)
            if entry is None:
                out[c] = (None, "unavailable", None)
            else:
                at = datetime.fromtimestamp(entry["ts"]).isoformat(timespec="minutes")
                out[c] = (entry["info"], "ok" if entry["info"] else "not_found", at)
        return out

    def _fetch(self, cuis: List[str]) -> None:
        with self._lock:
            wait = 1.1 - (time.time() - self._last_call)
            if wait > 0:
                time.sleep(wait)
            body = [{"cui": int(c), "data": date.today().isoformat()} for c in cuis]
            try:
                r = httpx.post(URL, json=body, timeout=15)
                self._last_call = time.time()
                # ANAF răspunde 404 când niciun CUI din cerere nu există.
                data = {"found": [], "notFound": [int(c) for c in cuis]} if r.status_code == 404 else r.json()
                if r.status_code not in (200, 404):
                    raise httpx.HTTPStatusError("ANAF", request=r.request, response=r)
            except (httpx.HTTPError, ValueError):
                return  # rămân în cache valorile vechi (dacă există)

            ts = time.time()
            for f in data.get("found", []):
                info = _parse(f)
                self._cache[info["cui"]] = {"info": info, "ts": ts}
            for c in data.get("notFound", data.get("notfound", [])):
                self._cache[str(c)] = {"info": None, "ts": ts}
            CACHE_FILE.parent.mkdir(exist_ok=True)
            CACHE_FILE.write_text(json.dumps(self._cache, ensure_ascii=False, indent=1), encoding="utf-8")


client = AnafClient()
