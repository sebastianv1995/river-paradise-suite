$source = Join-Path $PSScriptRoot 'backend\river_paradise.json'
if (!(Test-Path -LiteralPath $source)) { exit 0 }
$folder = Join-Path $PSScriptRoot 'respaldos'
New-Item -ItemType Directory -Force -Path $folder | Out-Null
$target = Join-Path $folder ("river_paradise_{0}.json" -f (Get-Date -Format 'yyyy-MM-dd_HHmmss'))
Copy-Item -LiteralPath $source -Destination $target
Get-ChildItem -LiteralPath $folder -Filter 'river_paradise_*.json' | Sort-Object LastWriteTime -Descending | Select-Object -Skip 30 | Remove-Item -Force
