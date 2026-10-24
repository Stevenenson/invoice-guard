#!/bin/sh
# Pornește InvoiceGuard (macOS / Linux). Prima rulare instalează dependențele.
cd "$(dirname "$0")"
if [ ! -d .venv ]; then
  python3 -m venv .venv && .venv/bin/pip install -q --upgrade pip && .venv/bin/pip install -q -r backend/requirements.txt
fi
echo "Demo:  http://127.0.0.1:8000"
echo "API:   http://127.0.0.1:8000/docs"
exec .venv/bin/uvicorn backend.main:app --reload --reload-dir backend --host 127.0.0.1 --port 8000
