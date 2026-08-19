$ErrorActionPreference = 'Continue'
$root = $PSScriptRoot
$backend = Join-Path $root 'backend'
$logDirectory = Join-Path $root 'logs'
$logFile = Join-Path $logDirectory 'servidor.log'
New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null

$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$node = if ($nodeCommand) { $nodeCommand.Source } else { Join-Path $env:ProgramFiles 'nodejs\node.exe' }
if (-not (Test-Path -LiteralPath $node)) {
  "$(Get-Date -Format s) ERROR: Node.js no está instalado o no se encontró." | Add-Content -LiteralPath $logFile
  exit 1
}

$env:PORT = '8080'
$env:HOST = '0.0.0.0'
while ($true) {
  "$(Get-Date -Format s) Iniciando River Paradise..." | Add-Content -LiteralPath $logFile
  Push-Location $backend
  try { & $node 'server.js' 2>&1 | Add-Content -LiteralPath $logFile }
  catch { "$(Get-Date -Format s) ERROR: $($_.Exception.Message)" | Add-Content -LiteralPath $logFile }
  finally { Pop-Location }
  "$(Get-Date -Format s) El servidor se detuvo. Reintentando en 5 segundos." | Add-Content -LiteralPath $logFile
  Start-Sleep -Seconds 5
}
