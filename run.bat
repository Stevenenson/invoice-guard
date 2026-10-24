@echo off
rem Porneste InvoiceGuard pe Windows (demo web + API). Prima rulare instaleaza dependentele.
cd /d "%~dp0"
if not exist .venv\Scripts\python.exe (
  echo Prima pornire: creez mediul Python si instalez pachetele...
  py -3 -m venv .venv 2>nul || python -m venv .venv
  if not exist .venv\Scripts\python.exe (
    echo Nu gasesc Python. Instalati-l de pe https://www.python.org/downloads/ si bifati "Add python.exe to PATH".
    pause
    exit /b 1
  )
  .venv\Scripts\python -m pip install -q --upgrade pip
  .venv\Scripts\python -m pip install -q -r backend\requirements.txt
)
echo.
echo Demo:  http://127.0.0.1:8000
echo API:   http://127.0.0.1:8000/docs
echo Inchideti fereastra sau apasati Ctrl+C ca sa opriti serverul.
echo.
start "" http://127.0.0.1:8000
.venv\Scripts\python -m uvicorn backend.main:app --reload --reload-dir backend --host 127.0.0.1 --port 8000
pause
