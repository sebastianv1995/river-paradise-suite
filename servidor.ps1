$ErrorActionPreference = 'Continue'
$root = $PSScriptRoot
$backend = Join-Path $root 'backend'
$logDirectory = Join-Path $root 'logs'
$logFile = Join-Path $logDirectory 'servidor.log'
New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null

function Write-ServerLog {
  param([string]$Message)
  $line = "$(Get-Date -Format s) $Message"
  try {
    $line | Out-File -LiteralPath $logFile -Append -Encoding utf8
  } catch {
    Write-Host $line
  }
}

$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$node = if ($nodeCommand) { $nodeCommand.Source } else { Join-Path $env:ProgramFiles 'nodejs\node.exe' }
if (-not (Test-Path -LiteralPath $node)) {
  Write-ServerLog 'ERROR: Node.js no está instalado o no se encontró.'
  exit 1
}

$serverFile = Join-Path $backend 'server.js'
if (-not (Test-Path -LiteralPath $serverFile)) {
  Write-ServerLog "ERROR: No se encontró $serverFile."
  exit 1
}

$env:PORT = '8080'
$env:HOST = '0.0.0.0'
while ($true) {
  Write-ServerLog 'Iniciando River Paradise...'
  try {
    $process = Start-Process -FilePath $node -ArgumentList 'server.js' -WorkingDirectory $backend -WindowStyle Hidden -PassThru -Wait
    Write-ServerLog "El servidor se detuvo con código $($process.ExitCode). Reintentando en 5 segundos."
  } catch {
    Write-ServerLog "ERROR: $($_.Exception.Message). Reintentando en 5 segundos."
  }
  Start-Sleep -Seconds 5
}
