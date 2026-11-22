$ErrorActionPreference = 'Stop'
$dir = Join-Path $PSScriptRoot 'data'
$json = [IO.File]::ReadAllText((Join-Path $dir 'catalog.json'), [Text.Encoding]::UTF8)

$data = $json | ConvertFrom-Json
$ids = @($data.services | ForEach-Object { $_.id })
if (($ids | Select-Object -Unique).Count -ne $ids.Count) { throw 'Duplicate service ids in catalog.json' }
foreach ($p in $data.presets) {
  foreach ($i in $p.items) { if ($ids -notcontains $i.id) { throw ("Preset '" + $p.id + "' uses unknown service '" + $i.id + "'") } }
}

$js = "window.SUBDOG_DATA = " + $json.Trim() + ";`n"
[IO.File]::WriteAllText((Join-Path $dir 'catalog.js'), $js, (New-Object Text.UTF8Encoding($false)))
Write-Host ("OK: " + $ids.Count + " services, " + @($data.presets).Count + " presets -> data/catalog.js")
