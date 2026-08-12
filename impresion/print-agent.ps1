param([Parameter(Mandatory=$true)][string]$ConfigPath)
$ErrorActionPreference = 'Stop'
$config = Get-Content -LiteralPath $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
$root = Split-Path -Parent $PSScriptRoot
Write-Host "Agente $($config.location) conectado a $($config.server_url)"
while ($true) {
  try {
    $body = @{ location_id=$config.location; agent=$env:COMPUTERNAME } | ConvertTo-Json
    $uri = "$($config.server_url.TrimEnd('/'))/api/print-jobs/claim"
    try { $job = Invoke-RestMethod -Method Post -Uri $uri -ContentType 'application/json' -Body $body -TimeoutSec 10 }
    catch { if ($_.Exception.Response.StatusCode.value__ -eq 204) { $job=$null } else { throw } }
    if ($job) {
      $ticketPath = Join-Path $env:TEMP "river-print-$($job.id).json"
      $job.ticket | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $ticketPath -Encoding UTF8
      try {
        $script = if ($job.type -eq 'kitchen') { Join-Path $root 'backend\print-ticket.ps1' } else { Join-Path $root 'backend\print-receipt.ps1' }
        & $script -TicketPath $ticketPath -PrinterName $config.printer_name -Copies ([int]$job.copies)
        $result = @{ ok=$true } | ConvertTo-Json
      } catch { $result = @{ ok=$false; error=$_.Exception.Message } | ConvertTo-Json }
      Remove-Item -LiteralPath $ticketPath -Force -ErrorAction SilentlyContinue
      Invoke-RestMethod -Method Post -Uri "$($config.server_url.TrimEnd('/'))/api/print-jobs/$($job.id)/complete" -ContentType 'application/json' -Body $result -TimeoutSec 10 | Out-Null
    }
  } catch { Write-Warning "Esperando conexión: $($_.Exception.Message)" }
  Start-Sleep -Seconds 3
}
