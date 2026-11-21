# Regenerates data/catalog.js (copy for file:// mode) from data/catalog.json and validates the JSON.
# Run after every edit of catalog.json:
#   powershell -ExecutionPolicy Bypass -File sync-catalog.ps1
$ErrorActionPreference = 'Stop'
$dir = Join-Path $PSScriptRoot 'data'
$json = [IO.File]::ReadAllText((Join-Path $dir 'catalog.json'), [Text.Encoding]::UTF8)

$data = $json | ConvertFrom-Json   # throws if the JSON is invalid
$ids = @($data.services | ForEach-Object { $_.id })
if (($ids | Select-Object -Unique).Count -ne $ids.Count) { throw 'Duplicate service ids in catalog.json' }
foreach ($p in $data.presets) {
  foreach ($i in $p.items) { if ($ids -notcontains $i.id) { throw ("Preset '" + $p.id + "' uses unknown service '" + $i.id + "'") } }
}

$js = "/* Generated from catalog.json by sync-catalog.ps1 - copy for file:// mode (fetch is blocked there). Do not edit by hand. */`nwindow.SUBDOG_DATA = " + $json.Trim() + ";`n"
[IO.File]::WriteAllText((Join-Path $dir 'catalog.js'), $js, (New-Object Text.UTF8Encoding($false)))
Write-Host ("OK: " + $ids.Count + " services, " + @($data.presets).Count + " presets -> data/catalog.js")
