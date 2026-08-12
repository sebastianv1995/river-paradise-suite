param(
  [Parameter(Mandatory = $true)][string]$TicketPath,
  [Parameter(Mandatory = $true)][string]$PrinterName,
  [ValidateRange(1, 5)][int]$Copies = 2
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$printer = Get-Printer -Name $PrinterName -ErrorAction Stop
if ($printer.PrinterStatus -notin @('Normal', 'Idle', 0, 3)) {
  throw "La impresora '$PrinterName' no esta disponible. Estado: $($printer.PrinterStatus)"
}

$ticket = Get-Content -LiteralPath $TicketPath -Raw -Encoding UTF8 | ConvertFrom-Json
$document = New-Object System.Drawing.Printing.PrintDocument
$document.PrinterSettings.PrinterName = $PrinterName
$document.PrintController = New-Object System.Drawing.Printing.StandardPrintController
$document.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(8, 8, 8, 8)
$document.DocumentName = "$($ticket.title) - $($ticket.table)"

$document.add_PrintPage({
  param($sender, $eventArgs)
  $graphics = $eventArgs.Graphics
  $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $left = [single]$eventArgs.MarginBounds.Left
  $top = [single]$eventArgs.MarginBounds.Top
  $width = [single]$eventArgs.MarginBounds.Width
  $right = $left + $width
  $y = $top
  $black = [System.Drawing.Brushes]::Black
  $titleFont = New-Object System.Drawing.Font('Arial', 15, [System.Drawing.FontStyle]::Bold)
  $subtitleFont = New-Object System.Drawing.Font('Arial', 11, [System.Drawing.FontStyle]::Regular)
  $tableFont = New-Object System.Drawing.Font('Arial', 14, [System.Drawing.FontStyle]::Bold)
  $bodyFont = New-Object System.Drawing.Font('Arial', 11, [System.Drawing.FontStyle]::Regular)
  $quantityFont = New-Object System.Drawing.Font('Arial', 12, [System.Drawing.FontStyle]::Bold)
  $smallFont = New-Object System.Drawing.Font('Arial', 9, [System.Drawing.FontStyle]::Regular)
  $center = New-Object System.Drawing.StringFormat
  $center.Alignment = [System.Drawing.StringAlignment]::Center
  $center.LineAlignment = [System.Drawing.StringAlignment]::Near
  $dashPen = New-Object System.Drawing.Pen([System.Drawing.Color]::Black, 1)
  $dashPen.DashStyle = [System.Drawing.Drawing2D.DashStyle]::Dash
  try {
    $graphics.DrawString([string]$ticket.title, $titleFont, $black, ([System.Drawing.RectangleF]::new($left, $y, $width, 24)), $center); $y += 25
    $graphics.DrawString([string]$ticket.location, $subtitleFont, $black, ([System.Drawing.RectangleF]::new($left, $y, $width, 19)), $center); $y += 23
    $graphics.DrawLine($dashPen, $left, $y, $right, $y); $y += 10
    $graphics.DrawString([string]$ticket.table, $tableFont, $black, $left, $y); $y += 23
    $graphics.DrawString([string]$ticket.date, $smallFont, $black, $left, $y); $y += 19
    $graphics.DrawLine($dashPen, $left, $y, $right, $y); $y += 9
    foreach ($item in $ticket.items) {
      $nameWidth = [Math]::Max(80, $width - 38)
      $measured = $graphics.MeasureString([string]$item.name, $bodyFont, [int]$nameWidth)
      $rowHeight = [single][Math]::Max(22, [Math]::Ceiling($measured.Height) + 4)
      $graphics.DrawString([string]$item.quantity, $quantityFont, $black, $left, $y)
      $graphics.DrawString([string]$item.name, $bodyFont, $black, ([System.Drawing.RectangleF]::new(($left + 34), $y, $nameWidth, $rowHeight)))
      $y += $rowHeight
    }
    $y += 3; $graphics.DrawLine($dashPen, $left, $y, $right, $y); $y += 10
    $graphics.DrawString([string]$ticket.footer, $smallFont, $black, ([System.Drawing.RectangleF]::new($left, $y, $width, 30)), $center)
    $eventArgs.HasMorePages = $false
  } finally {
    $titleFont.Dispose(); $subtitleFont.Dispose(); $tableFont.Dispose(); $bodyFont.Dispose(); $quantityFont.Dispose(); $smallFont.Dispose(); $center.Dispose(); $dashPen.Dispose()
  }
})

try {
  for ($copy = 1; $copy -le $Copies; $copy++) { $document.Print() }
} finally { $document.Dispose() }
