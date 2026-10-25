"""API-ul InvoiceGuard. Pornire (din folderul proiectului):

    uvicorn backend.main:app --reload

Apoi: http://127.0.0.1:8000 (demo) și http://127.0.0.1:8000/docs (documentația API).
"""
from __future__ import annotations

import csv
import io
import os
import threading
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from typing import List, Optional

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import efactura, rules
from . import seed as db
from .anaf import client as anaf
from .inbox import Inbox
from .notify import notify

ROOT = Path(__file__).resolve().parent.parent
FACTURI = {f"{f['cui']}|{f['nr']}": f for f in db.FACTURI}
# Aplicația desktop setează INVOICEGUARD_INBOX = folderul în care contabilul pune facturile din SPV.
INBOX: Optional[Inbox] = None
# Se schimbă la fiecare pornire: fereastra desktop își resetează atunci aprobările.
SESIUNE = datetime.now().isoformat(timespec="seconds")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Încălzește cache-ul ANAF în fundal, ca primul demo să fie instant.
    cuis = list(db.CONTRACTE) + [f["cui"] for f in db.FACTURI]
    threading.Thread(target=anaf_lookup_many, args=(cuis,), daemon=True).start()
    global INBOX
    if os.environ.get("INVOICEGUARD_INBOX"):
        INBOX = Inbox(Path(os.environ["INVOICEGUARD_INBOX"]).expanduser(), _verify_and_store, _alert)
        threading.Thread(target=INBOX.start, daemon=True).start()
    yield


app = FastAPI(
    title="InvoiceGuard API",
    description="Verifică o factură primită înainte de plată: SPV, IBAN, ANAF (live), contract, dubluri, nume clonat.",
    version="0.2.0",
    lifespan=lifespan,
)
# Extensia Chrome rulează pe alt domeniu decât API-ul.
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


class InvoiceRef(BaseModel):
    cui: str
    nr: str
    furnizor: Optional[str] = None
    total: Optional[float] = None


class Batch(BaseModel):
    facturi: List[InvoiceRef]


def anaf_lookup_many(cuis: List[str]) -> dict:
    """ANAF live, cu excepția firmelor fictive din demo (marcate „simulat”)."""
    real = [c for c in cuis if c not in db.ANAF_SIMULAT]
    res = anaf.lookup(real) if real else {}
    for c in cuis:
        if c in db.ANAF_SIMULAT:
            res[c] = (db.ANAF_SIMULAT[c], "simulat", None)
    return res


def verify_one(inv: dict) -> dict:
    return rules.verify_invoice(inv, anaf_lookup_many([inv["cui"]]).get(inv["cui"], (None, "unavailable", None)), db)


def _verify_and_store(inv: dict) -> dict:
    FACTURI[f"{inv['cui']}|{inv['nr']}"] = inv
    return verify_one(inv)


def _alert(r: dict) -> None:
    motiv = r["motive"][0]["scurt"] if r["motive"] else ""
    if r["decizie"] == "BLOCHEAZA":
        notify("InvoiceGuard: NU plătiți", f"{r['furnizor']} · {r['factura']} · {motiv}")
    elif r["decizie"] == "VERIFICA":
        notify("InvoiceGuard: de verificat", f"{r['furnizor']} · {r['factura']} · {motiv}")


def _invoice(ref: InvoiceRef) -> dict:
    cui = ref.cui.upper().replace("RO", "").strip()
    known = FACTURI.get(f"{cui}|{ref.nr}")
    if known:
        return known
    # Factură pe care n-am primit-o nici din SPV, nici pe e-mail: verificăm ce se poate.
    return {"cui": cui, "nr": ref.nr, "furnizor": ref.furnizor or "", "total": ref.total, "sursa": "necunoscută", "iban": None, "linii": []}


@app.get("/api/health")
def health():
    return {"ok": True, "facturi": len(FACTURI)}


@app.get("/api/anaf/{cui}", summary="Date live de la ANAF pentru un CUI")
def anaf_lookup(cui: str):
    cui = cui.upper().replace("RO", "").strip()
    if not rules.cui_valid(cui):
        raise HTTPException(422, f"CUI {cui} invalid (cifra de control nu se potrivește).")
    info, status, at = anaf_lookup_many([cui])[cui]
    if status == "unavailable":
        raise HTTPException(503, "ANAF nu răspunde momentan.")
    return {"cui": cui, "status": status, "interogat_la": at, "date": info}


@app.post("/api/verify", summary="Verifică o factură")
def verify(ref: InvoiceRef):
    return verify_one(_invoice(ref))


@app.post("/api/verify-batch", summary="Verifică mai multe facturi (o singură interogare ANAF)")
def verify_batch(batch: Batch):
    invs = [_invoice(r) for r in batch.facturi]
    res = anaf_lookup_many([i["cui"] for i in invs])
    return {"rezultate": [rules.verify_invoice(i, res.get(i["cui"], (None, "unavailable", None)), db) for i in invs]}


@app.post("/api/upload-efactura", summary="Încarcă un XML e-Factura și verifică-l")
async def upload(file: UploadFile = File(...)):
    content = await file.read()
    if len(content) > 5_000_000:
        raise HTTPException(413, "Fișier prea mare.")
    try:
        inv = efactura.parse(content)
    except efactura.InvalidInvoice as e:
        raise HTTPException(422, str(e))
    if not inv["nr"] or not inv["cui"]:
        raise HTTPException(422, "Factura nu are număr sau CUI-ul furnizorului.")
    return _verify_and_store(inv)


# ---------- Aplicația desktop: folderul cu facturi ----------
class ExportRequest(BaseModel):
    fisiere: List[str]


def _inbox() -> Inbox:
    if INBOX is None:
        raise HTTPException(404, "Urmărirea folderului e pornită doar în aplicația desktop (python -m desktop).")
    return INBOX


@app.get("/api/inbox", summary="Facturile din folderul urmărit, deja verificate")
def inbox_list():
    if INBOX is None:
        return {"activ": False, "folder": None, "facturi": []}
    return {"activ": True, "folder": str(INBOX.folder), "sesiune": SESIUNE, "facturi": INBOX.items()}


@app.post("/api/inbox/upload", summary="Adaugă o factură în folderul urmărit (trage-și-lasă)")
async def inbox_upload(file: UploadFile = File(...)):
    box = _inbox()
    content = await file.read()
    if len(content) > 5_000_000:
        raise HTTPException(413, "Fișier prea mare.")
    if not (file.filename or "").lower().endswith((".xml", ".zip")):
        raise HTTPException(422, "Trageți un XML e-Factura sau arhiva ZIP descărcată din SPV.")
    name = box.save(file.filename or "factura.xml", content)
    return box.get(name)


@app.delete("/api/inbox/{fisier}", summary="Scoate o factură din listă (fișierul se mută în folderul Sterse)")
def inbox_delete(fisier: str):
    if not _inbox().remove(fisier):
        raise HTTPException(404, "Factura nu mai e în listă.")
    return {"sterse": 1}


@app.delete("/api/inbox", summary="Scoate toate facturile din listă (fișierele se mută în folderul Sterse)")
def inbox_clear():
    return {"sterse": _inbox().clear()}


@app.post("/api/inbox/export", summary="Salvează fișierul de plăți pentru facturile aprobate")
def inbox_export(req: ExportRequest):
    box = _inbox()
    rezultate = [i["rezultat"] for n in req.fisiere if (i := box.get(n)) and "rezultat" in i]
    if not rezultate:
        raise HTTPException(422, "Nicio factură aprobată pentru plată.")
    buf = io.StringIO()
    w = csv.writer(buf, delimiter=";")
    w.writerow(["Beneficiar", "CUI", "IBAN", "Suma", "Moneda", "Detalii plata"])
    for r in rezultate:
        w.writerow([r["furnizor"], r["cui"], r["iban_plata"] or r["iban"], f"{r['total']:.2f}", "RON", f"Contravaloare factura {r['factura']}"])
    folder = box.folder.parent / "Plati"
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f"plati-aprobate-{datetime.now():%Y-%m-%d-%H%M%S}.csv"
    path.write_text("\ufeff" + buf.getvalue(), encoding="utf-8")
    return {"fisier": str(path), "facturi": len(rezultate)}


# Demo-ul (soft-ul de facturare simulat + add-on-ul), servit de același server.
app.mount("/app", StaticFiles(directory=ROOT / "app"), name="app")
app.mount("/extension", StaticFiles(directory=ROOT / "extension"), name="extension")
app.mount("/samples", StaticFiles(directory=ROOT / "samples"), name="samples")
app.mount("/desktop", StaticFiles(directory=ROOT / "desktop" / "web", html=True), name="desktop")


@app.get("/", include_in_schema=False)
def index():
    return FileResponse(ROOT / "index.html")
