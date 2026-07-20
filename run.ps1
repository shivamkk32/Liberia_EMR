# Launch the National EMR/EHR platform (backend + frontend) in two windows.
# Usage:  powershell -ExecutionPolicy Bypass -File .\run.ps1
# First time, it auto-installs deps and seeds the database.

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$backend = Join-Path $root "backend"
$frontend = Join-Path $root "frontend"
$venvPy = Join-Path $backend ".venv\Scripts\python.exe"

# --- Anaconda OpenSSL DLLs on PATH (needed for pip/ssl in the venv) ---
$anaconda = "$env:USERPROFILE\anaconda3"
if (Test-Path "$anaconda\Library\bin") {
    $env:PATH = "$anaconda\Library\bin;$anaconda\DLLs;$env:PATH"
}

# --- First-time backend setup ---
if (-not (Test-Path $venvPy)) {
    Write-Host "First run: creating backend virtualenv + installing deps..." -ForegroundColor Cyan
    python -m venv (Join-Path $backend ".venv")
    & $venvPy -m pip install --upgrade pip
    & $venvPy -m pip install --prefer-binary -r (Join-Path $backend "requirements.txt")
}
if (-not (Test-Path (Join-Path $backend "emr.db"))) {
    Write-Host "Seeding demo database..." -ForegroundColor Cyan
    Push-Location $backend; & $venvPy -m app.seed; Pop-Location
}

# --- First-time frontend setup ---
if (-not (Test-Path (Join-Path $frontend "node_modules"))) {
    Write-Host "Installing frontend deps..." -ForegroundColor Cyan
    Push-Location $frontend; npm install; Pop-Location
}

# --- Launch backend (port 8000) in a new window ---
Write-Host "Starting backend  -> http://localhost:8000/docs" -ForegroundColor Green
$backendCmd = "`$env:PATH='$anaconda\Library\bin;$anaconda\DLLs;'+`$env:PATH; " +
              "Set-Location '$backend'; " +
              ".\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $backendCmd

Start-Sleep -Seconds 2

# --- Launch frontend (port 5173) in a new window ---
Write-Host "Starting frontend -> http://localhost:5173" -ForegroundColor Green
$frontendCmd = "Set-Location '$frontend'; npm run dev"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $frontendCmd

Write-Host ""
Write-Host "EMR is launching in two new windows." -ForegroundColor Yellow
Write-Host "  App:  http://localhost:5173   (login: sjohnson / emr1234)"
Write-Host "  API:  http://localhost:8000/docs"
Write-Host "Close those two windows to stop the servers."
