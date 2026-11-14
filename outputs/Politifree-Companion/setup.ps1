param([string]$PythonPath = '')
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
if (-not $PythonPath) {
  if (Get-Command py -ErrorAction SilentlyContinue) {
    $PythonPath = (Get-Command py).Source
    $PythonArgs = @('-3.12')
  } else {
    $PythonPath = (Get-Command python -ErrorAction Stop).Source
    $PythonArgs = @()
  }
} else {
  $PythonArgs = @()
}
& $PythonPath @PythonArgs check_environment.py --runtime-only
if ($LASTEXITCODE -ne 0) { throw 'A supported Python version is required. Pass -PythonPath with the path to 64-bit Python 3.12.' }
& $PythonPath @PythonArgs verify_models.py
if ($LASTEXITCODE -ne 0) { throw 'Extract the complete Politifree Companion package before setup.' }
$venvPython = Join-Path $PSScriptRoot '.venv/Scripts/python.exe'
$dependenciesReady = $false
if (Test-Path -LiteralPath $venvPython) {
  & $venvPython check_environment.py
  $dependenciesReady = ($LASTEXITCODE -eq 0)
}
if (-not $dependenciesReady) {
  if (-not (Test-Path -LiteralPath $venvPython)) {
    & $PythonPath @PythonArgs -m venv .venv
    if ($LASTEXITCODE -ne 0) { throw 'Could not create the companion environment.' }
  }
  & $venvPython -m pip install -r requirements.txt
  if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
}
& $venvPython check_environment.py
if ($LASTEXITCODE -ne 0) { throw 'The Companion environment is incomplete. Rerun setup to repair it.' }
Write-Host 'Local analysis dependencies are ready.'
