param([string]$PythonPath = '')
$ErrorActionPreference = 'Stop'
function Invoke-PolitifreePython {
  param([string]$Executable, [string[]]$Arguments, [switch]$Quiet)
  $previousPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'Continue'
    if ($Quiet) { & $Executable @Arguments *> $null }
    else { & $Executable @Arguments 2>&1 | Out-Host }
    return ($LASTEXITCODE -eq 0)
  } catch { return $false } finally { $ErrorActionPreference = $previousPreference }
}
function Initialize-PolitifreeEnvironment {
  param([string]$Root, [string]$BasePython, [string[]]$BaseArguments)
  $environmentPath = [IO.Path]::GetFullPath((Join-Path $Root '.venv'))
  $venvPython = Join-Path $environmentPath 'Scripts/python.exe'
  $usable = (Test-Path -LiteralPath $venvPython) -and
    (Invoke-PolitifreePython $venvPython @('check_environment.py','--runtime-only') -Quiet) -and
    (Invoke-PolitifreePython $venvPython @('-m','pip','--version') -Quiet)
  if (-not $usable) {
    if (Test-Path -LiteralPath $environmentPath) {
      # Preserve the failed environment for recovery. Rename only this known
      # child of the install directory; never recursively delete an old venv.
      $expectedRoot = [IO.Path]::GetFullPath($Root).TrimEnd('\')
      if ([IO.Path]::GetDirectoryName($environmentPath) -ne $expectedRoot) { throw 'Unsafe environment repair path.' }
      $backupName = '.venv-repair-' + [guid]::NewGuid().ToString('N')
      Rename-Item -LiteralPath $environmentPath -NewName $backupName
      Write-Host "Previous Python environment preserved in $backupName"
    }
    if (-not (Invoke-PolitifreePython $BasePython (@($BaseArguments) + @('-m','venv',$environmentPath)))) { throw 'Could not create the companion environment.' }
  }
  if (-not (Invoke-PolitifreePython $venvPython @('check_environment.py') -Quiet)) {
    if (-not (Invoke-PolitifreePython $venvPython @('-m','pip','install','-r','requirements.txt'))) { throw 'Dependency installation failed.' }
  }
  if (-not (Invoke-PolitifreePython $venvPython @('check_environment.py'))) { throw 'The Companion environment is incomplete. Rerun setup to repair it.' }
}
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
if (-not (Invoke-PolitifreePython $PythonPath (@($PythonArgs) + @('check_environment.py','--runtime-only')))) { throw 'A supported Python version is required. Pass -PythonPath with the path to 64-bit Python 3.12.' }
if (-not (Invoke-PolitifreePython $PythonPath (@($PythonArgs) + @('verify_models.py')))) { throw 'Extract the complete Politifree Companion package before setup.' }
Initialize-PolitifreeEnvironment -Root $PSScriptRoot -BasePython $PythonPath -BaseArguments $PythonArgs
Write-Host 'Local analysis dependencies are ready.'
