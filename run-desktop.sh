#!/bin/sh
# Pornește InvoiceGuard Desktop (macOS / Linux): fereastra de lângă SAGA.
cd "$(dirname "$0")"
if [ ! -d .venv ]; then
  python3 -m venv .venv && .venv/bin/pip install -q --upgrade pip && .venv/bin/pip install -q -r backend/requirements.txt
fi
.venv/bin/python -c "import webview" 2>/dev/null || .venv/bin/pip install -q -r desktop/requirements.txt
exec .venv/bin/python -m desktop
