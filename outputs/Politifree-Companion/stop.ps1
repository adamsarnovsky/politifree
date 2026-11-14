param([string]$CompanionRoot = $PSScriptRoot)
$ErrorActionPreference = 'Stop'
$companionPath = (Resolve-Path -LiteralPath $CompanionRoot).Path
$pidPath = Join-Path $companionPath 'runtime.pid'
$expectedServer = (Resolve-Path -LiteralPath (Join-Path $companionPath 'server.py')).Path
# Windows venv python.exe can launch a second Python process. Identify both by
# the exact script argument; a PID alone may be stale or point at the launcher.
$nativeServer = Join-Path $companionPath 'native_host.py'
$scriptPattern = '^\s*(?:"[^"]+"|\S+)\s+(?:-u\s+)?(?:"' + ('(?:' + [regex]::Escape($expectedServer) + '|' + [regex]::Escape($nativeServer) + ')') + '"|' + ('(?:' + [regex]::Escape($expectedServer) + '|' + [regex]::Escape($nativeServer) + ')') + ')(?:\s|$)'
$processes = @(Get-CimInstance Win32_Process -Filter "Name='python.exe' OR Name='pythonw.exe'" | Where-Object { $_.CommandLine -match $scriptPattern })
$ids = @($processes | ForEach-Object { $_.ProcessId })
# Stop the actual interpreter before its launcher, without killing unrelated children.
foreach ($process in ($processes | Sort-Object { if ($ids -contains $_.ParentProcessId) { 0 } else { 1 } })) {
  $current = Get-CimInstance Win32_Process -Filter "ProcessId=$($process.ProcessId)" -ErrorAction SilentlyContinue
  if ($current -and $current.CreationDate -eq $process.CreationDate -and $current.CommandLine -match $scriptPattern) {
    Stop-Process -Id $current.ProcessId -Force -ErrorAction SilentlyContinue
  }
}
for ($attempt = 0; $attempt -lt 50; $attempt++) {
  $remaining = @(Get-CimInstance Win32_Process -Filter "Name='python.exe' OR Name='pythonw.exe'" | Where-Object { $_.CommandLine -match $scriptPattern })
  if (-not $remaining.Count) { break }
  Start-Sleep -Milliseconds 100
}
if ($remaining.Count) { throw 'The Companion process did not stop. Installed files must not be replaced while it is running.' }
if (Test-Path -LiteralPath $pidPath) { Remove-Item -LiteralPath $pidPath -Force }
Write-Host 'Politifree Companion stopped (or was already stopped).'
