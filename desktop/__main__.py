"""InvoiceGuard Desktop: fereastra care stă lângă SAGA. Pornire, din folderul proiectului:

    python -m desktop

Pornește serverul InvoiceGuard în fundal, urmărește folderul cu facturi
(implicit ~/InvoiceGuard/Facturi) și deschide o fereastră mereu deasupra.
"""
from __future__ import annotations

import os
import subprocess
import sys
import threading
import time
import urllib.request
from pathlib import Path

import uvicorn
import webview

PORT = int(os.environ.get("INVOICEGUARD_PORT", "8765"))  # alt port decât demo-ul web (8000)
INBOX = Path(os.environ.get("INVOICEGUARD_INBOX", Path.home() / "InvoiceGuard" / "Facturi")).expanduser()
MAX_BYTES = 5_000_000


def open_path(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)
    if sys.platform == "darwin":
        subprocess.Popen(["open", str(path)])
    elif sys.platform == "win32":
        os.startfile(str(path))  # type: ignore[attr-defined]
    else:
        subprocess.Popen(["xdg-open", str(path)])


class NativeApi:
    """Funcții apelabile din pagină prin window.pywebview.api."""

    def __init__(self) -> None:
        self._window = None  # prefixul _ îl ascunde de pywebview

    def is_on_top(self) -> bool:
        return self._window.on_top

    def toggle_on_top(self) -> bool:
        self._window.on_top = not self._window.on_top
        return self._window.on_top

    def _dialog(self, kind, **kwargs) -> tuple:
        """Dialogul sistemului. O fereastră „mereu deasupra” l-ar acoperi, așa că o coborâm cât timp e deschis."""
        on_top = self._window.on_top
        self._window.on_top = False
        try:
            return tuple(self._window.create_file_dialog(kind, **kwargs) or ())
        finally:
            self._window.on_top = on_top

    def import_files(self) -> list:
        """Alege facturile cu dialogul sistemului și le pune în folderul urmărit."""
        # pywebview nu acceptă cratimă în descrierea filtrului
        paths = self._dialog(webview.FileDialog.OPEN, allow_multiple=True, file_types=("Facturi SPV (*.xml;*.zip)",))
        from backend import main as server
        rezultat = []
        for path in map(Path, paths):
            try:
                if path.stat().st_size > MAX_BYTES:
                    raise ValueError("Fișier prea mare.")
                server.INBOX.save(path.name, path.read_bytes())
                rezultat.append({"nume": path.name})
            except (OSError, ValueError) as e:
                rezultat.append({"nume": path.name, "eroare": str(e)})
        return rezultat

    def export_invoices(self, fisiere: list, deblocate: list = None) -> dict:
        """Contabilul alege folderul; fiecare factură verificată se salvează exact cum a fost importată, gata de SAGA."""
        folder = self._dialog(webview.FileDialog.FOLDER)
        if not folder:
            return {"anulat": True}
        from backend import main as server
        dest = Path(folder[0])
        salvate = server.INBOX.export(fisiere, dest, deblocate or [])
        if salvate:
            open_path(dest)
        return {"folder": str(dest), "salvate": len(salvate)}

    def open_folder(self, which: str = "facturi") -> None:
        open_path({"facturi": INBOX, "sterse": INBOX.parent / "Sterse"}.get(which, INBOX.parent / "Plati"))


def wait_for_server(timeout: float = 20) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            urllib.request.urlopen(f"http://127.0.0.1:{PORT}/api/health", timeout=1)
            return
        except OSError:
            time.sleep(0.2)
    raise SystemExit(f"Serverul nu a pornit pe portul {PORT}.")


def main() -> None:
    # Fiecare pornire începe cu lista goală; facturile de data trecută ajung în folderul „Sterse”.
    from backend.inbox import empty_folder
    if moved := empty_folder(INBOX):
        print(f"InvoiceGuard Desktop: {moved} facturi de data trecută mutate în {INBOX.parent / 'Sterse'}")

    os.environ["INVOICEGUARD_INBOX"] = str(INBOX)
    from backend.main import app

    server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=PORT, log_level="warning"))
    threading.Thread(target=server.run, daemon=True).start()
    wait_for_server()
    print(f"InvoiceGuard Desktop: urmăresc {INBOX}")

    api = NativeApi()
    window = webview.create_window(
        "InvoiceGuard", f"http://127.0.0.1:{PORT}/desktop/",
        # Lată: lista și detaliile stau una lângă alta. Îngustată lângă SAGA, detaliile se deschid sub factură.
        # Nu e „mereu deasupra” de la pornire, ca să nu acopere Finder-ul și dialogurile; se activează din 📌.
        width=1000, height=760, min_size=(380, 560), on_top=False, js_api=api,
    )
    api._window = window
    webview.start()


if __name__ == "__main__":
    main()
