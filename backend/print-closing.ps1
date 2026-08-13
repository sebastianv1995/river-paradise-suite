param(
  [Parameter(Mandatory=$true)][string]$TicketPath,
  [Parameter(Mandatory=$true)][string]$PrinterName,
  [ValidateRange(1,5)][int]$Copies=2
)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$printer=Get-Printer -Name $PrinterName -ErrorAction Stop
$ticket=Get-Content -LiteralPath $TicketPath -Raw -Encoding UTF8|ConvertFrom-Json
$document=New-Object System.Drawing.Printing.PrintDocument
$document.PrinterSettings.PrinterName=$PrinterName
$document.PrintController=New-Object System.Drawing.Printing.StandardPrintController
$document.DefaultPageSettings.Margins=New-Object System.Drawing.Printing.Margins(7,7,7,7)
$document.DocumentName="Cierre $($ticket.location) $($ticket.date)"
$document.add_PrintPage({
  param($sender,$eventArgs)
  $g=$eventArgs.Graphics;$left=[single]$eventArgs.MarginBounds.Left;$y=[single]$eventArgs.MarginBounds.Top;$width=[single]$eventArgs.MarginBounds.Width;$right=$left+$width
  $black=[System.Drawing.Brushes]::Black
  $title=New-Object System.Drawing.Font('Arial',14,[System.Drawing.FontStyle]::Bold)
  $bold=New-Object System.Drawing.Font('Arial',10,[System.Drawing.FontStyle]::Bold)
  $body=New-Object System.Drawing.Font('Arial',9,[System.Drawing.FontStyle]::Regular)
  $total=New-Object System.Drawing.Font('Arial',12,[System.Drawing.FontStyle]::Bold)
  $center=New-Object System.Drawing.StringFormat;$center.Alignment=[System.Drawing.StringAlignment]::Center
  $rightAlign=New-Object System.Drawing.StringFormat;$rightAlign.Alignment=[System.Drawing.StringAlignment]::Far
  $pen=New-Object System.Drawing.Pen([System.Drawing.Color]::Black,1);$pen.DashStyle=[System.Drawing.Drawing2D.DashStyle]::Dash
  try{
    $g.DrawString([string]$ticket.title,$title,$black,([System.Drawing.RectangleF]::new($left,$y,$width,22)),$center);$y+=23
    $g.DrawString([string]$ticket.location,$bold,$black,([System.Drawing.RectangleF]::new($left,$y,$width,18)),$center);$y+=19
    $g.DrawString(("Cierre del "+[string]$ticket.date+" a las "+[string]$ticket.time),$body,$black,([System.Drawing.RectangleF]::new($left,$y,$width,18)),$center);$y+=22
    $g.DrawLine($pen,$left,$y,$right,$y);$y+=8
    $g.DrawString('RESUMEN FINANCIERO',$bold,$black,$left,$y);$y+=20
    foreach($row in $ticket.rows){
      $g.DrawString([string]$row.label,$body,$black,$left,$y)
      $g.DrawString([string]$row.value,$bold,$black,([System.Drawing.RectangleF]::new($left,$y,$width,17)),$rightAlign);$y+=19
      $g.DrawLine([System.Drawing.Pens]::LightGray,$left,$y,$right,$y);$y+=4
    }
    $y+=4;$g.DrawString('TOTAL EN CAJA',$total,$black,$left,$y)
    $g.DrawString([string]$ticket.total,$total,$black,([System.Drawing.RectangleF]::new($left,$y,$width,22)),$rightAlign)
    $eventArgs.HasMorePages=$false
  }finally{$title.Dispose();$bold.Dispose();$body.Dispose();$total.Dispose();$center.Dispose();$rightAlign.Dispose();$pen.Dispose()}
})
try{for($copy=1;$copy -le $Copies;$copy++){$document.Print()}}finally{$document.Dispose()}
