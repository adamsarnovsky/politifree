param([Parameter(Mandatory=$true)][string]$ExtensionPath)
$ErrorActionPreference = 'Stop'
$manifest = Get-Content -LiteralPath (Join-Path $ExtensionPath 'manifest.json') -Raw | ConvertFrom-Json
# Match Chromium's Windows unpacked-ID algorithm (UTF-16LE path bytes with an
# uppercase drive letter). A future Store manifest uses its public key instead.
$resolvedExtension = (Resolve-Path -LiteralPath $ExtensionPath).Path.TrimEnd('\')
if ($resolvedExtension -match '^[a-z]:') { $resolvedExtension = $resolvedExtension.Substring(0,1).ToUpperInvariant() + $resolvedExtension.Substring(1) }
$identity = if ($manifest.key) { [Convert]::FromBase64String($manifest.key) } else { [Text.Encoding]::Unicode.GetBytes($resolvedExtension) }
$sha = [Security.Cryptography.SHA256]::Create()
try { $bytes = $sha.ComputeHash($identity) } finally { $sha.Dispose() }
$alphabet = 'abcdefghijklmnop'
$extensionId = -join ($bytes[0..15] | ForEach-Object { [string]$alphabet[[int]($_ -shr 4)] + [string]$alphabet[[int]($_ -band 15)] })
$hostPath = Join-Path $PSScriptRoot 'app.politifree.engine.json'
$native = @{name='app.politifree.engine'; description='Politifree local media analysis'; path=(Join-Path $PSScriptRoot 'native-host.bat'); type='stdio'; allowed_origins=@("chrome-extension://$extensionId/")}
$native | ConvertTo-Json | Set-Content -LiteralPath $hostPath -Encoding UTF8
$keyPath = 'HKCU:\Software\Google\Chrome\NativeMessagingHosts\app.politifree.engine'
New-Item -Path $keyPath -Force | Out-Null
Set-Item -LiteralPath $keyPath -Value $hostPath
Write-Host 'Politifree media analysis is connected automatically.'
