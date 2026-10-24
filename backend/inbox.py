"""Urmărește un folder cu facturi e-Factura și le verifică pe măsură ce apar.

Contabilul descarcă oricum facturile din SPV ca să le importe în SAGA. Dacă le salvează
(sau le trage) în acest folder, fiecare factură nouă e verificată în câteva secunde.
Acceptă XML-ul facturii sau arhiva ZIP descărcată din SPV (XML + semnătura ANAF).
"""
from __future__ import annotations

import io
import re
import threading
import time
import zipfile
from datetime import datetime
from pathlib import Path
from typing import Callable, Dict, List, Optional

from . import efactura

SCAN_SECONDS = 2
MAX_BYTES = 5_000_000


def read_invoice_xml(path: Path) -> bytes:
    data = path.read_bytes()
    if path.suffix.lower() != ".zip":
        return data
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        # Arhiva SPV conține factura și un fișier „semnatura_…xml”; ne trebuie factura.
        names = [n for n in z.namelist() if n.lower().endswith(".xml") and not Path(n).name.lower().startswith("semnatura")]
        if not names:
            raise efactura.InvalidInvoice("Arhiva nu conține un XML de factură.")
        info = z.getinfo(names[0])
        if info.file_size > MAX_BYTES:
            raise efactura.InvalidInvoice("Factura din arhivă e prea mare.")
        return z.read(info)


def safe_name(name: str) -> str:
    name = Path(name).name
    return re.sub(r"[^A-Za-z0-9._-]", "_", name)[:120] or "factura.xml"


class Inbox:
    def __init__(self, folder: Path, verify: Callable[[dict], dict], on_new: Callable[[dict], None]) -> None:
        self.folder = folder
        self._verify = verify
        self._on_new = on_new
        self._seen: Dict[str, float] = {}
        self._items: Dict[str, dict] = {}
        self._lock = threading.Lock()

    def start(self) -> None:
        self.folder.mkdir(parents=True, exist_ok=True)
        self.scan(notify=False)  # ce era deja în folder nu declanșează notificări
        threading.Thread(target=self._loop, daemon=True).start()

    def _loop(self) -> None:
        while True:
            time.sleep(SCAN_SECONDS)
            try:
                self.scan()
            except Exception:  # un fișier stricat nu oprește urmărirea folderului
                pass

    def scan(self, notify: bool = True) -> None:
        with self._lock:
            for path in sorted(self.folder.iterdir()):
                if path.suffix.lower() not in (".xml", ".zip") or path.name.startswith("."):
                    continue
                mtime = path.stat().st_mtime
                if self._seen.get(path.name) == mtime:
                    continue
                self._seen[path.name] = mtime
                item = {"fisier": path.name, "primit_la": datetime.fromtimestamp(mtime).isoformat(timespec="seconds")}
                try:
                    if path.stat().st_size > MAX_BYTES:
                        raise efactura.InvalidInvoice("Fișier prea mare.")
                    inv = efactura.parse(read_invoice_xml(path))
                    if not inv["nr"] or not inv["cui"]:
                        raise efactura.InvalidInvoice("Factura nu are număr sau CUI-ul furnizorului.")
                    item["rezultat"] = self._verify(inv)
                except (efactura.InvalidInvoice, zipfile.BadZipFile, OSError) as e:
                    item["eroare"] = str(e)
                    # Un fișier încă în curs de copiere (sau blocat pe Windows) se citește din nou la scanarea următoare:
                    # copierea din Explorer/Finder păstrează data fișierului, deci mtime nu s-ar schimba.
                    del self._seen[path.name]
                self._items[path.name] = item
                if notify and "rezultat" in item:
                    self._on_new(item["rezultat"])

    def save(self, filename: str, content: bytes) -> str:
        name = safe_name(filename)
        target = self.folder / name
        if target.exists():
            target = self.folder / f"{target.stem}-{int(time.time())}{target.suffix}"
        target.write_bytes(content)
        self.scan()
        return target.name

    def items(self) -> List[dict]:
        with self._lock:
            return sorted(self._items.values(), key=lambda i: i["primit_la"], reverse=True)

    def get(self, name: str) -> Optional[dict]:
        return self._items.get(name)
