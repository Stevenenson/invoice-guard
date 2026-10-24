"""API-ul InvoiceGuard. Pornire (din folderul proiectului):

    uvicorn backend.main:app --reload

Apoi: http://127.0.0.1:8000 (demo) și http://127.0.0.1:8000/docs (documentația API).
"""
from __future__ import annotations

import threading
from contextlib import asynccontextmanager
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

ROOT = Path(__file__).resolve().parent.parent
FACTURI = {f"{f['cui']}|{f['nr']}": f for f in db.FACTURI}


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Încălzește cache-ul ANAF în fundal, ca primul demo să fie instant.
    cuis = list(db.CONTRACTE) + [f["cui"] for f in db.FACTURI]
    threading.Thread(target=anaf.lookup, args=(cuis,), daemon=True).start()
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
    info, status, at = anaf.lookup([cui])[cui]
    if status == "unavailable":
        raise HTTPException(503, "ANAF nu răspunde momentan.")
    return {"cui": cui, "status": status, "interogat_la": at, "date": info}


@app.post("/api/verify", summary="Verifică o factură")
def verify(ref: InvoiceRef):
    inv = _invoice(ref)
    return rules.verify_invoice(inv, anaf.lookup([inv["cui"]]).get(inv["cui"], (None, "unavailable", None)), db)


@app.post("/api/verify-batch", summary="Verifică mai multe facturi (o singură interogare ANAF)")
def verify_batch(batch: Batch):
    invs = [_invoice(r) for r in batch.facturi]
    res = anaf.lookup([i["cui"] for i in invs])
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
    FACTURI[f"{inv['cui']}|{inv['nr']}"] = inv
    return rules.verify_invoice(inv, anaf.lookup([inv["cui"]]).get(inv["cui"], (None, "unavailable", None)), db)


# Demo-ul (soft-ul de facturare simulat + add-on-ul), servit de același server.
app.mount("/app", StaticFiles(directory=ROOT / "app"), name="app")
app.mount("/extension", StaticFiles(directory=ROOT / "extension"), name="extension")
app.mount("/samples", StaticFiles(directory=ROOT / "samples"), name="samples")


@app.get("/", include_in_schema=False)
def index():
    return FileResponse(ROOT / "index.html")
