$source = Join-Path $PSScriptRoot 'backend\river_paradise.sqlite'
if (!(Test-Path -LiteralPath $source)) { exit 0 }
$folder = Join-Path $PSScriptRoot 'respaldos'
New-Item -ItemType Directory -Force -Path $folder | Out-Null
$target = Join-Path $folder ("river_paradise_{0}.sqlite" -f (Get-Date -Format 'yyyy-MM-dd_HHmmss'))
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (!$node) { $node = Join-Path $env:ProgramFiles 'nodejs\node.exe' }
if (!(Test-Path -LiteralPath $node)) { exit 1 }
& $node (Join-Path $PSScriptRoot 'backend\backup-sqlite.js') $source $target
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'menu.json') -Destination (Join-Path $folder ("menu_{0}.json" -f (Get-Date -Format 'yyyy-MM-dd_HHmmss')))
Get-ChildItem -LiteralPath $folder -Filter 'river_paradise_*.sqlite' | Sort-Object LastWriteTime -Descending | Select-Object -Skip 60 | Remove-Item -Force
Get-ChildItem -LiteralPath $folder -Filter 'menu_*.json' | Sort-Object LastWriteTime -Descending | Select-Object -Skip 60 | Remove-Item -Force
