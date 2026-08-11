param(
  [Parameter(Mandatory = $true)][string]$TicketPath,
  [Parameter(Mandatory = $true)][string]$PrinterName
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$printer = Get-Printer -Name $PrinterName -ErrorAction Stop
if ($printer.PrinterStatus -notin @('Normal', 'Idle', 0, 3)) { throw "Impresora no disponible: $($printer.PrinterStatus)" }
$ticket = Get-Content -LiteralPath $TicketPath -Raw -Encoding UTF8 | ConvertFrom-Json
$document = New-Object System.Drawing.Printing.PrintDocument
$document.PrinterSettings.PrinterName = $PrinterName
$document.PrintController = New-Object System.Drawing.Printing.StandardPrintController
$document.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(7, 7, 7, 7)
$document.DocumentName = "$($ticket.subtitle) - $($ticket.reference)"
$document.add_PrintPage({
  param($sender, $eventArgs)
  $g=$eventArgs.Graphics; $g.TextRenderingHint=[System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $left=[single]$eventArgs.MarginBounds.Left; $y=[single]$eventArgs.MarginBounds.Top; $width=[single]$eventArgs.MarginBounds.Width; $right=$left+$width
  $black=[System.Drawing.Brushes]::Black
  $title=New-Object System.Drawing.Font('Arial',15,[System.Drawing.FontStyle]::Bold); $bold=New-Object System.Drawing.Font('Arial',10,[System.Drawing.FontStyle]::Bold)
  $body=New-Object System.Drawing.Font('Arial',9,[System.Drawing.FontStyle]::Regular); $small=New-Object System.Drawing.Font('Arial',8,[System.Drawing.FontStyle]::Regular)
  $totalFont=New-Object System.Drawing.Font('Arial',13,[System.Drawing.FontStyle]::Bold); $center=New-Object System.Drawing.StringFormat; $center.Alignment=[System.Drawing.StringAlignment]::Center
  $rightAlign=New-Object System.Drawing.StringFormat; $rightAlign.Alignment=[System.Drawing.StringAlignment]::Far
  $pen=New-Object System.Drawing.Pen([System.Drawing.Color]::Black,1); $pen.DashStyle=[System.Drawing.Drawing2D.DashStyle]::Dash
  try {
    $g.DrawString([string]$ticket.title,$title,$black,([System.Drawing.RectangleF]::new($left,$y,$width,23)),$center);$y+=23
    $g.DrawString([string]$ticket.location,$body,$black,([System.Drawing.RectangleF]::new($left,$y,$width,16)),$center);$y+=16
    $g.DrawString([string]$ticket.subtitle,$bold,$black,([System.Drawing.RectangleF]::new($left,$y,$width,18)),$center);$y+=22
    $g.DrawLine($pen,$left,$y,$right,$y);$y+=8
    $g.DrawString([string]$ticket.reference,$bold,$black,$left,$y);$y+=17;$g.DrawString([string]$ticket.date,$small,$black,$left,$y);$y+=18
    $g.DrawLine($pen,$left,$y,$right,$y);$y+=7
    $g.DrawString('Cant.  Producto',$small,$black,$left,$y);$g.DrawString('P.Unit.   Subtotal',$small,$black,([System.Drawing.RectangleF]::new($left,$y,$width,15)),$rightAlign);$y+=16
    foreach($item in $ticket.items){
      $nameWidth=[Math]::Max(75,$width-118);$height=[single][Math]::Max(19,[Math]::Ceiling($g.MeasureString([string]$item.name,$body,[int]$nameWidth).Height)+2)
      $g.DrawString([string]$item.quantity,$bold,$black,$left,$y)
      $g.DrawString([string]$item.name,$body,$black,([System.Drawing.RectangleF]::new(($left+27),$y,$nameWidth,$height)))
      $g.DrawString(('$'+([double]$item.unit_price).ToString('0.00')),$small,$black,([System.Drawing.RectangleF]::new(($right-91),$y,43,$height)),$rightAlign)
      $g.DrawString(('$'+([double]$item.subtotal).ToString('0.00')),$small,$black,([System.Drawing.RectangleF]::new(($right-47),$y,47,$height)),$rightAlign);$y+=$height
    }
    $y+=3;$g.DrawLine($pen,$left,$y,$right,$y);$y+=8
    $g.DrawString('TOTAL',$totalFont,$black,$left,$y);$g.DrawString(('$'+([double]$ticket.total).ToString('0.00')),$totalFont,$black,([System.Drawing.RectangleF]::new($left,$y,$width,22)),$rightAlign);$y+=24
    $g.DrawString(('Pago: '+[string]$ticket.payment),$body,$black,$left,$y);$y+=16
    if($ticket.payment_reference){$g.DrawString(('Referencia: '+[string]$ticket.payment_reference),$small,$black,$left,$y);$y+=15}
    $g.DrawLine($pen,$left,$y,$right,$y);$y+=8
    if($ticket.invoice_requested){
      $g.DrawString('DATOS PARA FACTURA',$bold,$black,$left,$y);$y+=16;$g.DrawString(('Nombre: '+[string]$ticket.customer_name),$small,$black,$left,$y);$y+=14
      $g.DrawString(('RUC/Cedula: '+[string]$ticket.customer_tax_id),$small,$black,$left,$y);$y+=14;$g.DrawString(('Ciudad: '+[string]$ticket.customer_city),$small,$black,$left,$y);$y+=16
    }else{$g.DrawString('CLIENTE: CONSUMIDOR FINAL',$bold,$black,$left,$y);$y+=18}
    $g.DrawLine($pen,$left,$y,$right,$y);$y+=8
    $g.DrawString('Documento de respaldo. No es una factura electronica autorizada por el SRI.',$small,$black,([System.Drawing.RectangleF]::new($left,$y,$width,35)),$center)
    $eventArgs.HasMorePages=$false
  }finally{$title.Dispose();$bold.Dispose();$body.Dispose();$small.Dispose();$totalFont.Dispose();$center.Dispose();$rightAlign.Dispose();$pen.Dispose()}
})
try{$document.Print()}finally{$document.Dispose()}
