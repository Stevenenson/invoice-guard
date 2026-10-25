#!/bin/sh
# Dublu-click în Finder: pornește demo-ul web InvoiceGuard (http://127.0.0.1:8000).
cd "$(dirname "$0")" || exit 1
(sleep 4; open http://127.0.0.1:8000) &
exec ./run.sh
