param([string]$ExtensionId = '')
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
if ($ExtensionId -and $ExtensionId -notmatch '^[a-p]{32}$') { throw 'Extension ID must be 32 characters from a to p.' }
if (-not (Test-Path -LiteralPath '.venv/Scripts/python.exe')) { throw 'Run setup.ps1 first.' }
& '.\.venv\Scripts\python.exe' verify_models.py
if ($LASTEXITCODE -ne 0) { throw 'Companion model verification failed. Extract the complete Politifree Companion package.' }
$tokenPath = Join-Path $PSScriptRoot 'pairing-token.txt'
if (-not (Test-Path -LiteralPath $tokenPath)) {
  $bytes = New-Object byte[] 32
  $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
  $token = [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+','-').Replace('/','_')
  Set-Content -LiteralPath $tokenPath -Value $token -NoNewline
}
$serverArgs = @('"' + (Join-Path $PSScriptRoot 'server.py') + '"')
if ($ExtensionId) { $serverArgs += @('--extension-id', $ExtensionId) }
$pythonPath = Join-Path $PSScriptRoot '.venv/Scripts/python.exe'
$serverPath = Join-Path $PSScriptRoot 'server.py'
$stdoutPath = Join-Path $PSScriptRoot 'runtime-stdout.log'
$stderrPath = Join-Path $PSScriptRoot 'runtime-stderr.log'
$logPath = $stderrPath
$token = (Get-Content -LiteralPath $tokenPath -Raw).Trim()
$healthHeaders = @{Authorization="Bearer $token"}
$expectedVersion = '0.6.17'
$health = $null
try {
  $health = Invoke-RestMethod -Uri 'http://127.0.0.1:8765/health' -Headers $healthHeaders -TimeoutSec 3
} catch {}
if ($health.serviceAvailable) {
  if ($health.version -ne $expectedVersion) { throw "Companion $($health.version) is still running. Close that installation before starting version $expectedVersion." }
  Write-Host "Politifree Companion $($health.version) control service is already running."; return
}
$existing = Get-NetTCPConnection -LocalPort 8765 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($existing) { throw 'Port 8765 is already in use. Check whether Politifree Companion is already running.' }
$process = Start-Process -FilePath $pythonPath -ArgumentList $serverArgs -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath
Set-Content -LiteralPath (Join-Path $PSScriptRoot 'runtime.pid') -Value $process.Id
for ($attempt = 0; $attempt -lt 150; $attempt++) {
  Start-Sleep -Seconds 1
  try {
    $health = Invoke-RestMethod -Uri 'http://127.0.0.1:8765/health' -Headers @{Authorization="Bearer $token"} -TimeoutSec 3
    if ($health.serviceAvailable -and $health.version -eq $expectedVersion) { Write-Host 'Politifree Companion control service is ready. Use the Start button in the extension to load local models.'; return }
  } catch {}
  if ($process.HasExited) { break }
}
$detail = if (Test-Path -LiteralPath $logPath) { Get-Content -LiteralPath $logPath -Tail 12 | Out-String } else { 'No Companion startup log was created.' }
throw "Companion did not become ready. See runtime-stderr.log.`n$detail"
