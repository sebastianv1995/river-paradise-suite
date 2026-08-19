param([Parameter(Mandatory=$true)][string]$ConfigPath)
$ErrorActionPreference = 'Stop'
$config = Get-Content -LiteralPath $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
$config.server_url = [string]$config.server_url
if ($config.server_url -notmatch '^https?://') { $config.server_url = "http://$($config.server_url)" }
$root = Split-Path -Parent $PSScriptRoot
Write-Host "Agente $($config.location) conectado a $($config.server_url)"
while ($true) {
  $delayMilliseconds = 250
  try {
    # Windows conserva el nombre de la impresora después de apagar o desconectar el USB.
    # No se reclama una comanda hasta que el controlador vuelva a detectarla; así el
    # trabajo permanece seguro en la cola central mientras arranca Windows o se conecta.
    $printer = Get-Printer -Name ([string]$config.printer_name) -ErrorAction SilentlyContinue
    if (-not $printer) {
      Write-Warning "Esperando la impresora '$($config.printer_name)'..."
      Start-Sleep -Seconds 3
      continue
    }
    $offlineStatuses = @('Offline', 'Error', 'NotAvailable', 'NoToner', 'PaperJam', 'PaperOut', 'OutputBinFull', 'UserIntervention')
    if ($offlineStatuses -contains [string]$printer.PrinterStatus) {
      Write-Warning "Impresora no disponible ($($printer.PrinterStatus)). Se conserva la cola."
      Start-Sleep -Seconds 3
      continue
    }
    $body = @{ location_id=$config.location; agent=$env:COMPUTERNAME } | ConvertTo-Json
    $uri = "$($config.server_url.TrimEnd('/'))/api/print-jobs/claim"
    try { $job = Invoke-RestMethod -Method Post -Uri $uri -ContentType 'application/json' -Body $body -TimeoutSec 10 }
    catch { if ($_.Exception.Response.StatusCode.value__ -eq 204) { $job=$null } else { throw } }
    if ($job) {
      $delayMilliseconds = 25
      $ticketPath = Join-Path $env:TEMP "river-print-$($job.id).json"
      $job.ticket | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $ticketPath -Encoding UTF8
      try {
        $script = if ($job.type -eq 'kitchen') { Join-Path $root 'backend\print-ticket.ps1' } elseif ($job.type -eq 'closing') { Join-Path $root 'backend\print-closing.ps1' } else { Join-Path $root 'backend\print-receipt.ps1' }
        & $script -TicketPath $ticketPath -PrinterName $config.printer_name -Copies ([int]$job.copies)
        $result = @{ ok=$true } | ConvertTo-Json
      } catch {
        Write-Warning "No se pudo imprimir trabajo $($job.id): $($_.Exception.Message)"
        $result = @{ ok=$false; error=$_.Exception.Message } | ConvertTo-Json
      }
      Remove-Item -LiteralPath $ticketPath -Force -ErrorAction SilentlyContinue
      Invoke-RestMethod -Method Post -Uri "$($config.server_url.TrimEnd('/'))/api/print-jobs/$($job.id)/complete" -ContentType 'application/json' -Body $result -TimeoutSec 10 | Out-Null
    }
  } catch {
    Write-Warning "Esperando conexión: $($_.Exception.Message)"
    $delayMilliseconds = 2000
  }
  Start-Sleep -Milliseconds $delayMilliseconds
}
