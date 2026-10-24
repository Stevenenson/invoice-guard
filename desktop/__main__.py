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

    def toggle_on_top(self) -> bool:
        self._window.on_top = not self._window.on_top
        return self._window.on_top

    def open_folder(self, which: str = "facturi") -> None:
        open_path(INBOX if which == "facturi" else INBOX.parent / "Plati")


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
    os.environ["INVOICEGUARD_INBOX"] = str(INBOX)
    from backend.main import app

    server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=PORT, log_level="warning"))
    threading.Thread(target=server.run, daemon=True).start()
    wait_for_server()
    print(f"InvoiceGuard Desktop: urmăresc {INBOX}")

    api = NativeApi()
    window = webview.create_window(
        "InvoiceGuard", f"http://127.0.0.1:{PORT}/desktop/",
        width=420, height=780, min_size=(360, 520), on_top=True, js_api=api,
    )
    api._window = window
    webview.start()


if __name__ == "__main__":
    main()
