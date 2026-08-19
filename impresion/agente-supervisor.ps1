param([Parameter(Mandatory=$true)][string]$ConfigPath)
$ErrorActionPreference = 'Continue'
$agent = Join-Path $PSScriptRoot 'print-agent.ps1'
$logDirectory = Join-Path (Split-Path -Parent $PSScriptRoot) 'logs'
$logFile = Join-Path $logDirectory 'impresion.log'
New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null

while ($true) {
  "$(Get-Date -Format s) Iniciando agente de impresión..." | Add-Content -LiteralPath $logFile
  try {
    & powershell.exe -WindowStyle Hidden -NoProfile -ExecutionPolicy Bypass -File $agent -ConfigPath $ConfigPath 2>&1 | Add-Content -LiteralPath $logFile
  } catch {
    "$(Get-Date -Format s) ERROR: $($_.Exception.Message)" | Add-Content -LiteralPath $logFile
  }
  "$(Get-Date -Format s) El agente se detuvo. Reintentando en 5 segundos." | Add-Content -LiteralPath $logFile
  Start-Sleep -Seconds 5
}
