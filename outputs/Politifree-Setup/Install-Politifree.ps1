param(
  [string]$InstallRoot = (Join-Path $env:LOCALAPPDATA 'Politifree'),
  [switch]$NoBrowser,
  [switch]$NonInteractive
)
$ErrorActionPreference = 'Stop'
$bundle = $PSScriptRoot
$payload = Join-Path $bundle 'payload'
$installRoot = [IO.Path]::GetFullPath($InstallRoot)
$companion = Join-Path $installRoot 'Companion'
$extension = Join-Path $installRoot 'Chrome'
$chromeZip = Join-Path $payload 'Politifree-Chrome.zip'
$companionZip = Join-Path $payload 'Politifree-Companion.zip'
if (-not (Test-Path -LiteralPath $chromeZip) -or -not (Test-Path -LiteralPath $companionZip)) { throw 'The installer payload is incomplete. Extract the full Politifree-Setup ZIP before running this file.' }
$checksums = Join-Path $payload 'SHA256SUMS.txt'
if (-not (Test-Path -LiteralPath $checksums)) { throw 'The installer payload checksum list is missing.' }
$verifiedPayloads = @{'Politifree-Chrome.zip'=$false; 'Politifree-Companion.zip'=$false}
foreach ($line in Get-Content -LiteralPath $checksums) {
  if ($line -notmatch '^([0-9a-f]{64})\s+(.+)$') { throw 'The installer checksum list is invalid.' }
  $payloadName = $Matches[2]; $expectedHash = $Matches[1]
  if (-not $verifiedPayloads.ContainsKey($payloadName) -or $verifiedPayloads[$payloadName]) { throw 'The checksum list contains an unexpected or duplicate payload.' }
  $file = Join-Path $payload $payloadName
  if (-not (Test-Path -LiteralPath $file) -or (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expectedHash) { throw "The installer payload failed its checksum: $payloadName" }
  $verifiedPayloads[$payloadName] = $true
}
if ($verifiedPayloads.Values -contains $false) { throw 'The checksum list must verify both installer payloads.' }
$drive = [IO.DriveInfo]::new([IO.Path]::GetPathRoot($installRoot))
if ($drive.AvailableFreeSpace -lt 3GB) { throw 'Politifree needs at least 3 GB of free space for its models and Python dependencies.' }
$py = Get-Command py -ErrorAction SilentlyContinue
$hasPython312 = $false
if ($py) { & $py.Source -3.12 -c "import struct,sys;sys.exit(0 if struct.calcsize('P')==8 else 1)" *> $null; $hasPython312 = ($LASTEXITCODE -eq 0) }
if (-not $hasPython312) {
  $winget = Get-Command winget -ErrorAction SilentlyContinue
  if (-not $winget) { throw 'Install Python 3.12 (64-bit) and Windows App Installer, then run this installer again.' }
  Write-Host 'Installing Python 3.12 for your Windows account…'
  & $winget.Source install --id Python.Python.3.12 --exact --scope user --accept-package-agreements --accept-source-agreements
  if ($LASTEXITCODE -ne 0) { throw 'Python installation did not complete. Install Python 3.12 (64-bit), then run this installer again.' }
  $env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')
  $py = Get-Command py -ErrorAction SilentlyContinue
  if (-not $py) { throw 'Python 3.12 installed, but Windows has not exposed the py launcher yet. Sign out and back in, then run this installer again.' }
  & $py.Source -3.12 --version *> $null
  if ($LASTEXITCODE -ne 0) { throw 'Python 3.12 installed, but the launcher cannot find it yet. Sign out and back in, then run this installer again.' }
}
New-Item -ItemType Directory -Force -Path $companion,$extension | Out-Null
$stopHelper = Join-Path $bundle 'Stop-Companion.ps1'
if (-not (Test-Path -LiteralPath $stopHelper)) { throw 'The installer shutdown helper is missing. Extract the complete setup bundle.' }
if (Test-Path -LiteralPath (Join-Path $companion 'server.py')) {
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $stopHelper -CompanionRoot $companion
  if ($LASTEXITCODE -ne 0) { throw 'Could not stop the existing Politifree Companion before updating it.' }

}
Expand-Archive -LiteralPath $companionZip -DestinationPath $companion -Force
Expand-Archive -LiteralPath $chromeZip -DestinationPath $extension -Force
if (-not (Test-Path -LiteralPath (Join-Path $extension 'manifest.json'))) { throw 'The Chrome extension files did not extract correctly.' }
$setup = Join-Path $companion 'setup.ps1'
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $setup
if ($LASTEXITCODE -ne 0) { throw 'Companion setup failed. Check the Python installation and internet connection, then rerun this installer.' }
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $companion 'register-native.ps1') -ExtensionPath $extension
if ($LASTEXITCODE -ne 0) { throw 'Could not connect media analysis to Chrome.' }
# Retire only Politifree's old startup shortcut. The native host starts on demand.
$oldStartup = Join-Path ([Environment]::GetFolderPath('Startup')) 'Politifree Companion.lnk'
if ($installRoot -eq (Join-Path $env:LOCALAPPDATA 'Politifree') -and (Test-Path -LiteralPath $oldStartup)) { Remove-Item -LiteralPath $oldStartup -Force }
$chrome = @(
  (Join-Path $env:ProgramFiles 'Google/Chrome/Application/chrome.exe'),
  (Join-Path ${env:ProgramFiles(x86)} 'Google/Chrome/Application/chrome.exe'),
  (Join-Path $env:LOCALAPPDATA 'Google/Chrome/Application/chrome.exe')
) | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1
if ($chrome -and -not $NoBrowser) { Start-Process -FilePath $chrome -ArgumentList 'chrome://extensions' }
Write-Host ''
Write-Host 'Politifree is installed. Media analysis starts and stops automatically.' -ForegroundColor Green
Write-Host 'Open Chrome Extensions, enable Developer mode, choose Load unpacked, and select:'
Write-Host "  $extension" -ForegroundColor Cyan
Write-Host 'For future updates, click Reload on this same extension and refresh open websites.'
Write-Host 'If an older Politifree extension is still installed, disable it before enabling this version to prevent duplicate filtering.'
Write-Host 'No pairing token or separate analysis switch is required. Use the Politifree On/Off switch.'
if (-not $NonInteractive) { Read-Host 'Press Enter after reviewing these steps' }
