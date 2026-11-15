$ErrorActionPreference = 'Stop'
$workspace = Split-Path -Parent $PSScriptRoot
function Import-FunctionOnly([string]$Path, [string]$Name) {
  $tokens = $null; $errors = $null
  $ast = [Management.Automation.Language.Parser]::ParseFile($Path, [ref]$tokens, [ref]$errors)
  if ($errors.Count) { throw ($errors | Out-String) }
  $definition = $ast.Find({ param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $Name }, $true)
  if (-not $definition) { throw "Missing function $Name" }
  # Define only the named function, without executing the installer body.
  return $definition.Extent.Text
}
Invoke-Expression (Import-FunctionOnly (Join-Path $workspace 'outputs/Politifree-Setup/Install-Politifree.ps1') 'Find-PolitifreePython')
Invoke-Expression (Import-FunctionOnly (Join-Path $workspace 'outputs/Politifree-Companion/setup.ps1') 'Invoke-PolitifreePython')
Invoke-Expression (Import-FunctionOnly (Join-Path $workspace 'outputs/Politifree-Companion/setup.ps1') 'Initialize-PolitifreeEnvironment')
$fixtureRoot = Join-Path $PSScriptRoot ('python installer audit spaces ' + [char]0x00e9 + ' ' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $fixtureRoot | Out-Null
$missing = Join-Path $fixtureRoot 'missing-runtime.cmd'
$good = Join-Path $fixtureRoot 'python312.cmd'
@('@echo off', 'echo No suitable Python runtime found 1>&2', 'exit /b 103') | Set-Content -LiteralPath $missing -Encoding ASCII
@('@echo off', ('echo ' + [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($good))), 'exit /b 0') | Set-Content -LiteralPath $good -Encoding ASCII
if (Invoke-PolitifreePython $missing @('-3.12','-c','pass') -Quiet) { throw 'Missing runtime accepted' }
if ($ErrorActionPreference -ne 'Stop') { throw 'Probe changed caller error preference' }
Write-Output 'PASS expected native stderr is nonfatal under Windows PowerShell Stop preference'
$originalLocal = $env:LOCALAPPDATA; $originalProgramFiles = $env:ProgramFiles
$script:commands = @{}
function Get-Command { param($Name, $ErrorAction) if ($script:commands.ContainsKey($Name)) { return @{Source=$script:commands[$Name]} } }
try {
  $env:LOCALAPPDATA = $fixtureRoot; $env:ProgramFiles = $fixtureRoot
  $script:commands = @{py=$missing}
  if ($null -ne (Find-PolitifreePython)) { throw 'Missing 3.12 runtime accepted' }
  Write-Output 'PASS launcher without Python 3.12 returns no runtime so automatic installation can proceed'
  $script:commands = @{python=$good}
  if ((Find-PolitifreePython) -ne $good) { throw 'Launcherless Python 3.12 was not found' }
  Write-Output 'PASS launcherless Python 3.12 is discovered'
  $script:commands = @{py=$missing;python=$good}
  if ((Find-PolitifreePython) -ne $good) { throw 'Bad launcher prevented fallback' }
  Write-Output 'PASS missing launcher runtime falls back to a supported Python executable'
} finally {
  $env:LOCALAPPDATA = $originalLocal; $env:ProgramFiles = $originalProgramFiles
  Remove-Item -LiteralPath Function:\Get-Command
}
# Exercise filesystem preservation and creation decisions with simulated Python
# responses. No real venv, dependencies, registry or installed app is changed.
function Invoke-PolitifreePython {
  param([string]$Executable, [string[]]$Arguments, [switch]$Quiet)
  $script:calls += ,@($Executable, ($Arguments -join '|'))
  if ($Arguments[0] -eq '-m' -and $Arguments[1] -eq 'venv') {
    $script:created++
    New-Item -ItemType Directory -Path (Join-Path $Arguments[2] 'Scripts') -Force | Out-Null
    Set-Content -LiteralPath (Join-Path $Arguments[2] 'Scripts/python.exe') -Value 'fresh fixture'
    return $true
  }
  if ($Arguments -contains '--runtime-only') { return ($script:created -gt 0 -or $script:scenario -notin @('wrong-runtime','corrupt')) }
  if ($Arguments -contains '--version') { return ($script:created -gt 0 -or $script:scenario -ne 'missing-pip') }
  if ($Arguments -contains 'install') { $script:installed++; return $true }
  return ($script:scenario -eq 'valid' -or $script:installed -gt 0)
}
foreach ($script:scenario in @('fresh','valid','wrong-runtime','corrupt','missing-pip','missing-executable','dependencies')) {
  $root = Join-Path $fixtureRoot $script:scenario
  New-Item -ItemType Directory -Path $root | Out-Null
  if ($script:scenario -ne 'fresh') {
    New-Item -ItemType Directory -Path (Join-Path $root '.venv/Scripts') | Out-Null
    Set-Content -LiteralPath (Join-Path $root '.venv/preserve.txt') -Value 'keep this environment'
    if ($script:scenario -ne 'missing-executable') { Set-Content -LiteralPath (Join-Path $root '.venv/Scripts/python.exe') -Value 'existing fixture' }
  }
  $script:created = 0; $script:installed = 0; $script:calls = @()
  Initialize-PolitifreeEnvironment -Root $root -BasePython 'base-python-fixture' -BaseArguments @()
  $mustRecreate = $script:scenario -notin @('valid','dependencies')
  if ($script:created -ne [int]$mustRecreate) { throw "Wrong creation decision for $script:scenario" }
  if ($script:installed -ne [int]($script:scenario -ne 'valid')) { throw "Wrong dependency repair decision for $script:scenario" }
  $backups = @(Get-ChildItem -LiteralPath $root -Directory -Force | Where-Object Name -like '.venv-repair-*')
  $mustPreserve = $mustRecreate -and $script:scenario -ne 'fresh'
  if ($backups.Count -ne [int]$mustPreserve) { throw "Wrong backup count for $script:scenario" }
  if ($mustPreserve -and (Get-Content -LiteralPath (Join-Path $backups[0].FullName 'preserve.txt')) -ne 'keep this environment') { throw 'Original environment lost' }
  if (-not $mustRecreate -and -not (Test-Path -LiteralPath (Join-Path $root '.venv/preserve.txt'))) { throw 'Reusable environment replaced' }
  Write-Output "PASS $script:scenario environment: correct creation, dependency repair and preservation"
}
Write-Output "Fixtures preserved at $fixtureRoot"
