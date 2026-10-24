"""Notificări de sistem, fără biblioteci în plus: osascript pe macOS, PowerShell pe Windows."""
from __future__ import annotations

import subprocess
import sys


def _quote_applescript(s: str) -> str:
    return '"' + s.replace("\\", "\\\\").replace('"', '\\"') + '"'


def _quote_powershell(s: str) -> str:
    return "'" + s.replace("'", "''") + "'"


def notify(title: str, message: str) -> None:
    try:
        if sys.platform == "darwin":
            script = f"display notification {_quote_applescript(message)} with title {_quote_applescript(title)}"
            subprocess.Popen(["osascript", "-e", script])
        elif sys.platform == "win32":
            ps = (
                "Add-Type -AssemblyName System.Windows.Forms;"
                "$n = New-Object System.Windows.Forms.NotifyIcon;"
                "$n.Icon = [System.Drawing.SystemIcons]::Warning; $n.Visible = $true;"
                f"$n.ShowBalloonTip(8000, {_quote_powershell(title)}, {_quote_powershell(message)}, 'Warning');"
                "Start-Sleep -Seconds 9; $n.Dispose()"
            )
            subprocess.Popen(["powershell", "-NoProfile", "-WindowStyle", "Hidden", "-Command", ps])
    except OSError:
        pass  # fără notificare, fereastra arată oricum factura
