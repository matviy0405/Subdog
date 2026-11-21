# Subdog server for Windows: static files + JSON API (accounts, saved sets, admin catalog edits).
# No Node/Python needed: only Windows PowerShell 5.1 (built into Windows 10/11).
#
#   powershell -ExecutionPolicy Bypass -File serve.ps1            -> http://localhost:8080
#   powershell -ExecutionPolicy Bypass -File serve.ps1 -Port 9000 -AdminPassword "my-strong-password"
#
# Data is stored as JSON files in server-data/ (users, sets, catalog overrides). Passwords are hashed
# with PBKDF2-SHA256 (120000 iterations + random salt). Roles are checked on the server.
# This is a learning/demo server for one machine (single-threaded, HTTP only). For production use
# HTTPS behind a real web server and a real database (see README).
param(
  [int]$Port = 8080,
  [string]$DataDir = '',
  [string]$AdminPassword = ''
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Web.Extensions

$root = $PSScriptRoot
if (-not $DataDir) { $DataDir = Join-Path $root 'server-data' }
$null = New-Item -ItemType Directory -Force -Path $DataDir
$DataDir = (Resolve-Path $DataDir).Path
$js = New-Object System.Web.Script.Serialization.JavaScriptSerializer
$js.MaxJsonLength = 4194304
$js.RecursionLimit = 40
$utf8 = New-Object Text.UTF8Encoding($false)

$types = @{
  '.html' = 'text/html; charset=utf-8'; '.css' = 'text/css; charset=utf-8'
  '.js'   = 'application/javascript; charset=utf-8'; '.json' = 'application/json; charset=utf-8'
  '.svg'  = 'image/svg+xml'; '.png' = 'image/png'; '.ico' = 'image/x-icon'
  '.md'   = 'text/plain; charset=utf-8'
}
$csp = "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"

# ---------------------------------------------------------------- storage
function Load-List([string]$name) {
  $p = Join-Path $DataDir $name
  $list = [System.Collections.ArrayList]::new()
  if (Test-Path $p) {
    $t = [IO.File]::ReadAllText($p, $utf8)
    if ($t.Trim()) { foreach ($i in @($js.DeserializeObject($t))) { [void]$list.Add($i) } }
  }
  return ,$list
}
function Save-Json([string]$name, $obj) {
  $p = Join-Path $DataDir $name
  $tmp = $p + '.tmp'
  [IO.File]::WriteAllText($tmp, $js.Serialize($obj), $utf8)
  Move-Item -Force -LiteralPath $tmp -Destination $p
}

# ---------------------------------------------------------------- passwords and tokens
function Get-Hash([string]$pw, [byte[]]$salt) {
  $d = New-Object Security.Cryptography.Rfc2898DeriveBytes($pw, $salt, 120000, [Security.Cryptography.HashAlgorithmName]::SHA256)
  try { return [Convert]::ToBase64String($d.GetBytes(32)) } finally { $d.Dispose() }
}
function Test-Equal([string]$a, [string]$b) {
  if ($a.Length -ne $b.Length) { return $false }
  $r = 0
  for ($i = 0; $i -lt $a.Length; $i++) { $r = $r -bor ([int][char]$a[$i] -bxor [int][char]$b[$i]) }
  return ($r -eq 0)
}
$rng = [Security.Cryptography.RandomNumberGenerator]::Create()
function New-RandomBytes([int]$n) { $b = New-Object byte[] $n; $rng.GetBytes($b); return ,$b }
function New-Token { return -join ((New-RandomBytes 32) | ForEach-Object { $_.ToString('x2') }) }
function New-Id([string]$prefix) { return $prefix + (-join ((New-RandomBytes 8) | ForEach-Object { $_.ToString('x2') })) }

# ---------------------------------------------------------------- state
$script:users = Load-List 'users.json'
$script:sets = Load-List 'sets.json'
$script:sessions = @{}      # token -> @{ userId; expires }
$script:fails = @{}         # "ip|email" -> @{ n; first }

if ($script:users.Count -eq 0) {
  $adminPw = $AdminPassword
  if (-not $adminPw) { $adminPw = $env:SUBDOG_ADMIN_PASSWORD }
  if (-not $adminPw) { $adminPw = 'admin123'; Write-Host 'WARNING: default admin password "admin123" is used. Start with -AdminPassword "..." or delete server-data to reset.' -ForegroundColor Yellow }
  $salt = New-RandomBytes 16
  [void]$script:users.Add(@{ id = 'u-admin'; email = 'admin@subdog.local'; name = 'Admin'; role = 'admin'; salt = [Convert]::ToBase64String($salt); hash = (Get-Hash $adminPw $salt) })
  Save-Json 'users.json' $script:users
}

# ---------------------------------------------------------------- helpers
function Fail([int]$code, [string]$msg) { throw (New-Object psobject -Property @{ ApiCode = $code; ApiError = $msg }) }
function Test-Num($v) { return ($v -is [int] -or $v -is [long] -or $v -is [double] -or $v -is [decimal]) }
function Test-Str($v, [int]$max, [int]$min = 0) { return (($v -is [string]) -and $v.Length -ge $min -and $v.Length -le $max) }
function Pub($u) { return @{ id = $u['id']; email = $u['email']; name = $u['name']; role = $u['role'] } }

function Send-Raw($res, [int]$code, [byte[]]$bytes, [string]$type, [bool]$head = $false) {
  $res.StatusCode = $code
  $res.ContentType = $type
  $res.ContentLength64 = $bytes.Length
  $res.Headers.Add('X-Content-Type-Options', 'nosniff')
  $res.Headers.Add('Referrer-Policy', 'no-referrer')
  $res.Headers.Add('Cache-Control', 'no-store')
  if (-not $head -and $bytes.Length -gt 0) { $res.OutputStream.Write($bytes, 0, $bytes.Length) }
}
function Send-Json($res, [int]$code, $obj) { Send-Raw $res $code ($utf8.GetBytes($js.Serialize($obj))) 'application/json; charset=utf-8' }

function Read-Body($req) {
  if ($req.ContentLength64 -gt 1048576) { Fail 413 'too_large' }
  $sr = New-Object IO.StreamReader($req.InputStream, $utf8)
  $text = $sr.ReadToEnd()
  if ($text.Length -gt 1048576) { Fail 413 'too_large' }
  if (-not $text.Trim()) { return @{} }
  try { return $js.DeserializeObject($text) } catch { Fail 400 'bad_request' }
}

function Get-Auth($req) {
  $h = $req.Headers['Authorization']
  if (-not $h -or $h -notmatch '^Bearer ([0-9a-f]{64})$') { return $null }
  $tok = $Matches[1]
  $s = $script:sessions[$tok]
  if (-not $s) { return $null }
  if ($s.expires -lt (Get-Date)) { $script:sessions.Remove($tok); return $null }
  foreach ($u in $script:users) { if ($u['id'] -eq $s.userId) { return @{ user = $u; token = $tok } } }
  return $null
}
function Require-Auth($req) { $a = Get-Auth $req; if (-not $a) { Fail 401 'unauthorized' }; return $a }
function Require-Admin($req) { $a = Require-Auth $req; if ($a.user['role'] -ne 'admin') { Fail 403 'forbidden' }; return $a }
function New-Session($user) {
  $tok = New-Token
  $script:sessions[$tok] = @{ userId = $user['id']; expires = (Get-Date).AddDays(7) }
  return $tok
}

# ---------------------------------------------------------------- validation of client data
function Clean-State($st) {
  if (-not ($st -is [System.Collections.IDictionary])) { Fail 400 'invalid_set' }
  $items = [System.Collections.ArrayList]::new()
  $src = @($st['items'])
  if ($src.Count -gt 100) { Fail 400 'invalid_set' }
  foreach ($it in $src) {
    if (-not ($it -is [System.Collections.IDictionary]) -or -not (Test-Str $it['id'] 64 1)) { Fail 400 'invalid_set' }
    $o = @{ id = $it['id']; free = ($it['free'] -eq $true) }
    if ((Test-Num $it['qty']) -and $it['qty'] -ge 1 -and $it['qty'] -le 500) { $o['qty'] = [int]$it['qty'] }
    [void]$items.Add($o)
  }
  $plan = $st['plan']
  if (@('individual', 'student', 'team') -notcontains $plan) { Fail 400 'invalid_set' }
  $seats = 3
  if ((Test-Num $st['seats']) -and $st['seats'] -ge 1 -and $st['seats'] -le 500) { $seats = [int]$st['seats'] }
  return @{ items = $items; plan = $plan; seats = $seats; yearly = ($st['yearly'] -ne $false) }
}

function Test-Catalog($o) {
  if (-not ($o -is [System.Collections.IDictionary]) -or $o['v'] -ne 2) { return $false }
  $up = $o['upserts']; $del = @($o['deleted'])
  if (-not ($up -is [System.Collections.IDictionary]) -or $up.Count -gt 200 -or $del.Count -gt 200) { return $false }
  foreach ($d in $del) { if (-not (Test-Str $d 64 1)) { return $false } }
  foreach ($k in @($up.Keys)) {
    $s = $up[$k]
    if ($k -notmatch '^[a-z0-9][a-z0-9-]{0,63}$') { return $false }
    if (-not ($s -is [System.Collections.IDictionary]) -or $s['id'] -ne $k) { return $false }
    if (-not (Test-Str $s['name'] 80 1)) { return $false }
    if (-not (Test-Str $s['category'] 40 1) -or $s['category'] -notmatch '^[a-z0-9-]+$') { return $false }
    if (-not (Test-Num $s['price']) -or $s['price'] -lt 0 -or $s['price'] -gt 10000000) { return $false }
    if ($null -ne $s['yearlyPrice'] -and (-not (Test-Num $s['yearlyPrice']) -or $s['yearlyPrice'] -lt 0)) { return $false }
    if ($null -ne $s['studentDiscount'] -and (-not (Test-Num $s['studentDiscount']) -or $s['studentDiscount'] -lt 0 -or $s['studentDiscount'] -gt 100)) { return $false }
    if (-not (Test-Str $s['url'] 500 8) -or $s['url'] -notmatch '^https?://\S+$') { return $false }
    foreach ($f in @('desc', 'priceNote', 'desc_en', 'priceNote_en')) { if ($null -ne $s[$f] -and -not (Test-Str $s[$f] 2000)) { return $false } }
    foreach ($f in @('freeNote', 'freeNote_en')) { if ($null -ne $s[$f] -and -not (Test-Str $s[$f] 200)) { return $false } }
    if ($null -ne $s['group'] -and (-not (Test-Str $s['group'] 40) -or $s['group'] -notmatch '^[a-z0-9-]*$')) { return $false }
    if ($null -ne $s['priceSource'] -and @('official', 'partial', 'unverified', 'manual') -notcontains $s['priceSource']) { return $false }
    $t = $s['team']
    if ($null -ne $t -and (-not ($t -is [System.Collections.IDictionary]) -or -not (Test-Num $t['price']) -or $t['price'] -lt 0)) { return $false }
  }
  return $true
}

# ---------------------------------------------------------------- API
function Handle-Api($ctx, [string]$path) {
  $req = $ctx.Request; $res = $ctx.Response; $m = $req.HttpMethod
  $ip = $req.RemoteEndPoint.Address.ToString()

  if ($path -eq '/api/health' -and $m -eq 'GET') { return Send-Json $res 200 @{ subdog = $true; mode = 'server' } }

  if ($path -eq '/api/register' -and $m -eq 'POST') {
    $b = Read-Body $req
    $email = ([string]$b['email']).Trim().ToLower(); $name = ([string]$b['name']).Trim(); $pw = [string]$b['password']
    if ($email.Length -gt 254 -or $email -notmatch '^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$') { Fail 400 'invalid_email' }
    if ($name.Length -lt 2 -or $name.Length -gt 60) { Fail 400 'invalid_name' }
    if ($pw.Length -lt 6 -or $pw.Length -gt 200) { Fail 400 'weak_password' }
    foreach ($u in $script:users) { if ($u['email'] -eq $email) { Fail 409 'email_taken' } }
    $salt = New-RandomBytes 16
    $user = @{ id = (New-Id 'u-'); email = $email; name = $name; role = 'user'; salt = [Convert]::ToBase64String($salt); hash = (Get-Hash $pw $salt) }
    [void]$script:users.Add($user); Save-Json 'users.json' $script:users
    return Send-Json $res 200 @{ token = (New-Session $user); user = (Pub $user) }
  }

  if ($path -eq '/api/login' -and $m -eq 'POST') {
    $b = Read-Body $req
    $email = ([string]$b['email']).Trim().ToLower(); $pw = [string]$b['password']
    $key = $ip + '|' + $email
    $f = $script:fails[$key]
    if ($f -and $f.first -gt (Get-Date).AddMinutes(-10) -and $f.n -ge 5) { Fail 429 'too_many_attempts' }
    $user = $null
    foreach ($u in $script:users) { if ($u['email'] -eq $email) { $user = $u } }
    $ok = $false
    if ($user -and $pw.Length -le 200) { $ok = Test-Equal (Get-Hash $pw ([Convert]::FromBase64String($user['salt']))) $user['hash'] }
    elseif (-not $user) { $null = Get-Hash 'x' (New-RandomBytes 16) }   # same work for unknown e-mail
    if (-not $ok) {
      if (-not $f -or $f.first -le (Get-Date).AddMinutes(-10)) { $f = @{ n = 0; first = (Get-Date) } }
      $f.n++; $script:fails[$key] = $f
      Fail 401 'bad_credentials'
    }
    $script:fails.Remove($key)
    return Send-Json $res 200 @{ token = (New-Session $user); user = (Pub $user) }
  }

  if ($path -eq '/api/logout' -and $m -eq 'POST') {
    $a = Get-Auth $req
    if ($a) { $script:sessions.Remove($a.token) }
    return Send-Json $res 200 @{ ok = $true }
  }

  if ($path -eq '/api/me' -and $m -eq 'GET') { $a = Require-Auth $req; return Send-Json $res 200 @{ user = (Pub $a.user) } }

  if ($path -eq '/api/sets' -and $m -eq 'GET') {
    $a = Require-Auth $req
    $mine = [System.Collections.ArrayList]::new()
    foreach ($s in $script:sets) { if ($s['userId'] -eq $a.user['id']) { [void]$mine.Add($s) } }
    return Send-Json $res 200 @{ sets = $mine }
  }
  if ($path -eq '/api/sets' -and $m -eq 'POST') {
    $a = Require-Auth $req; $b = Read-Body $req
    $name = ([string]$b['name']).Trim()
    if ($name.Length -lt 1 -or $name.Length -gt 60) { Fail 400 'invalid_set' }
    $mineCount = 0; foreach ($s in $script:sets) { if ($s['userId'] -eq $a.user['id']) { $mineCount++ } }
    if ($mineCount -ge 100) { Fail 400 'invalid_set' }
    $rec = @{ id = (New-Id 'set-'); userId = $a.user['id']; name = $name; state = (Clean-State $b['state']); createdAt = [long]([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()) }
    [void]$script:sets.Add($rec); Save-Json 'sets.json' $script:sets
    return Send-Json $res 200 @{ set = $rec }
  }
  if ($path -match '^/api/sets/([A-Za-z0-9-]{1,64})$' -and $m -eq 'DELETE') {
    $a = Require-Auth $req; $id = $Matches[1]; $kept = [System.Collections.ArrayList]::new(); $found = $false
    foreach ($s in $script:sets) { if ($s['id'] -eq $id -and $s['userId'] -eq $a.user['id']) { $found = $true } else { [void]$kept.Add($s) } }
    if (-not $found) { Fail 404 'not_found' }
    $script:sets = $kept; Save-Json 'sets.json' $script:sets
    return Send-Json $res 200 @{ ok = $true }
  }

  if ($path -eq '/api/catalog-overrides' -and $m -eq 'GET') {
    $p = Join-Path $DataDir 'catalog-overrides.json'
    if (Test-Path $p) { return Send-Raw $res 200 ($utf8.GetBytes('{"overrides":' + [IO.File]::ReadAllText($p, $utf8) + '}')) 'application/json; charset=utf-8' }
    return Send-Json $res 200 @{ overrides = $null }
  }
  if ($path -eq '/api/catalog-overrides' -and $m -eq 'PUT') {
    $null = Require-Admin $req; $b = Read-Body $req
    if (-not (Test-Catalog $b)) { Fail 400 'invalid_catalog' }
    Save-Json 'catalog-overrides.json' $b
    return Send-Json $res 200 @{ ok = $true }
  }
  if ($path -eq '/api/catalog-overrides' -and $m -eq 'DELETE') {
    $null = Require-Admin $req
    $p = Join-Path $DataDir 'catalog-overrides.json'
    if (Test-Path $p) { Remove-Item -Force $p }
    return Send-Json $res 200 @{ ok = $true }
  }

  Fail 404 'not_found'
}

# ---------------------------------------------------------------- static files
function Handle-Static($ctx, [string]$path) {
  $req = $ctx.Request; $res = $ctx.Response
  if ($req.HttpMethod -ne 'GET' -and $req.HttpMethod -ne 'HEAD') { return Send-Raw $res 405 ([byte[]]@()) 'text/plain' }
  if ($path -eq '/') { $path = '/index.html' }
  $rel = $path.TrimStart('/')
  # never serve the data folder, dotfiles or the server script itself
  if ($rel -match '(^|[\\/])(server-data|\.)' -or $rel -match '\.ps1$') { return Send-Raw $res 404 ([byte[]]@()) 'text/plain' }
  $full = [IO.Path]::GetFullPath((Join-Path $root $rel))
  if (-not $full.StartsWith($root, [StringComparison]::OrdinalIgnoreCase) -or $full.StartsWith($DataDir, [StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path $full -PathType Leaf)) {
    return Send-Raw $res 404 ([byte[]]@()) 'text/plain'
  }
  $ext = [IO.Path]::GetExtension($full).ToLower()
  $type = 'application/octet-stream'; if ($types.ContainsKey($ext)) { $type = $types[$ext] }
  if ($ext -eq '.html') { $res.Headers.Add('Content-Security-Policy', $csp) }
  Send-Raw $res 200 ([IO.File]::ReadAllBytes($full)) $type ($req.HttpMethod -eq 'HEAD')
}

# ---------------------------------------------------------------- main loop
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Subdog running at http://localhost:$Port  (data: $DataDir)  Ctrl+C to stop"

try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    # One bad request must never stop the server.
    try {
      $path = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath)
      if ($path.StartsWith('/api/')) { Handle-Api $ctx $path } else { Handle-Static $ctx $path }
    } catch {
      $e = $_.TargetObject
      try {
        if ($e -and $e.ApiCode) { Send-Json $ctx.Response ([int]$e.ApiCode) @{ error = $e.ApiError } }
        else { Write-Host ('Request error: ' + $_.Exception.Message); Send-Json $ctx.Response 500 @{ error = 'server_error' } }
      } catch { }
    } finally {
      try { $ctx.Response.Close() } catch { }
    }
  }
} finally { $listener.Stop() }
