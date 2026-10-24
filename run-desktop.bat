@echo off
rem Porneste InvoiceGuard Desktop pe Windows: fereastra de langa SAGA.
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
.venv\Scripts\python -c "import webview" 2>nul || .venv\Scripts\python -m pip install -q -r desktop\requirements.txt
echo Folder urmarit: %USERPROFILE%\InvoiceGuard\Facturi
.venv\Scripts\python -m desktop
pause
