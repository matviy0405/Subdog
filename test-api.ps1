# Automated tests for the Subdog server (serve.ps1). ASCII only.
#   powershell -ExecutionPolicy Bypass -File test-api.ps1
# Starts a throw-away server on port 8090 with a temporary data folder, runs the checks, stops it.
param([int]$Port = 8090)
$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
$base = "http://localhost:$Port"
$tmp = Join-Path ([IO.Path]::GetTempPath()) ('subdog-test-' + [Guid]::NewGuid().ToString('N'))
$adminPw = 'test-admin-pass-1'
$script:pass = 0; $script:fail = 0; $script:proc = $null

function Start-Srv {
  $a = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $here 'serve.ps1'), '-Port', $Port, '-DataDir', $tmp, '-AdminPassword', $adminPw)
  $script:proc = Start-Process powershell -ArgumentList $a -PassThru -WindowStyle Hidden
  for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep -Milliseconds 250
    try { $r = Invoke-WebRequest "$base/api/health" -UseBasicParsing -TimeoutSec 2; if ($r.StatusCode -eq 200) { return } } catch { }
  }
  throw 'server did not start'
}
function Stop-Srv { if ($script:proc -and -not $script:proc.HasExited) { Stop-Process -Id $script:proc.Id -Force } ; Start-Sleep -Milliseconds 300 }

function Call([string]$method, [string]$path, $body = $null, [string]$token = '', [string]$raw = '') {
  $h = @{}; if ($token) { $h['Authorization'] = 'Bearer ' + $token }
  $p = @{ Uri = $base + $path; Method = $method; UseBasicParsing = $true; Headers = $h; TimeoutSec = 20 }
  if ($raw) { $p.Body = [Text.Encoding]::UTF8.GetBytes($raw); $p.ContentType = 'application/json' }
  elseif ($null -ne $body) { $p.Body = [Text.Encoding]::UTF8.GetBytes(($body | ConvertTo-Json -Depth 10 -Compress)); $p.ContentType = 'application/json' }
  $code = 0; $text = ''; $hdr = $null
  try { $r = Invoke-WebRequest @p; $code = [int]$r.StatusCode; $text = $r.Content; $hdr = $r.Headers }
  catch {
    $resp = $_.Exception.Response
    if (-not $resp) { throw }
    $code = [int]$resp.StatusCode
    if ($_.ErrorDetails -and $_.ErrorDetails.Message) { $text = $_.ErrorDetails.Message }
    else { try { $text = (New-Object IO.StreamReader($resp.GetResponseStream())).ReadToEnd() } catch { } }
  }
  $json = $null; if ($text -and $text.TrimStart().StartsWith('{')) { try { $json = $text | ConvertFrom-Json } catch { } }
  return @{ code = $code; text = $text; json = $json; headers = $hdr }
}
function Check([string]$name, [bool]$cond, [string]$info = '') {
  if ($cond) { $script:pass++; Write-Host ("  ok   " + $name) -ForegroundColor Green }
  else { $script:fail++; Write-Host ("  FAIL " + $name + " " + $info) -ForegroundColor Red }
}

try {
  Start-Srv
  Write-Host 'Static files and security'
  $r = Call GET '/'; Check 'index.html is served' ($r.code -eq 200 -and $r.text -like '*Subdog*')
  Check 'CSP header on HTML' ([bool]($r.headers['Content-Security-Policy'] -like "*default-src 'self'*"))
  Check 'catalog.json is served' ((Call GET '/data/catalog.json').code -eq 200)
  Check 'server-data is NOT served' ((Call GET '/server-data/users.json').code -eq 404)
  Check 'serve.ps1 is NOT served' ((Call GET '/serve.ps1').code -eq 404)
  Check 'path traversal is blocked' (@(400, 403, 404) -contains (Call GET '/..%2f..%2f..%2fWindows%2fwin.ini').code)
  Check 'unknown API route is 404 JSON' (((Call GET '/api/nope').code -eq 404))
  Check 'POST to static file is 405' ((Call POST '/index.html' @{}).code -eq 405)

  Write-Host 'Accounts'
  Check 'weak password rejected' ((Call POST '/api/register' @{ name = 'Test'; email = 'a@example.com'; password = '123' }).json.error -eq 'weak_password')
  Check 'bad e-mail rejected' ((Call POST '/api/register' @{ name = 'Test'; email = 'bad'; password = 'secret12' }).json.error -eq 'invalid_email')
  Check 'short name rejected' ((Call POST '/api/register' @{ name = 'T'; email = 'a@example.com'; password = 'secret12' }).json.error -eq 'invalid_name')
  $reg = Call POST '/api/register' @{ name = 'Alice'; email = 'Alice@Example.com'; password = 'secret12' }
  Check 'register ok, role user, e-mail lower-cased' ($reg.code -eq 200 -and $reg.json.user.role -eq 'user' -and $reg.json.user.email -eq 'alice@example.com')
  $tokA = $reg.json.token
  Check 'duplicate e-mail is 409' ((Call POST '/api/register' @{ name = 'Alice'; email = 'alice@example.com'; password = 'secret12' }).code -eq 409)
  Check 'me without token is 401' ((Call GET '/api/me').code -eq 401)
  Check 'me with garbage token is 401' ((Call GET '/api/me' $null ('0' * 64)).code -eq 401)
  Check 'me with token is ok' ((Call GET '/api/me' $null $tokA).json.user.email -eq 'alice@example.com')
  Check 'wrong password is 401' ((Call POST '/api/login' @{ email = 'alice@example.com'; password = 'wrongpass' }).code -eq 401)
  Check 'unknown e-mail is 401 (same answer)' ((Call POST '/api/login' @{ email = 'nobody@example.com'; password = 'wrongpass' }).json.error -eq 'bad_credentials')
  $lg = Call POST '/api/login' @{ email = 'alice@example.com'; password = 'secret12' }
  Check 'login ok' ($lg.code -eq 200 -and $lg.json.token.Length -eq 64)
  $users = Get-Content (Join-Path $tmp 'users.json') -Raw
  Check 'password is not stored in plain text' (($users -notlike '*secret12*') -and ($users -notlike "*$adminPw*"))
  Check 'hash and salt are stored' ($users -like '*"hash":"*' -and $users -like '*"salt":"*')

  Write-Host 'Saved sets'
  $state = @{ items = @(@{ id = 'notion'; free = $false }, @{ id = 'github'; free = $true; qty = 2 }); plan = 'student'; seats = 4; yearly = $true }
  Check 'sets need login' ((Call POST '/api/sets' @{ name = 'X'; state = $state }).code -eq 401)
  $s1 = Call POST '/api/sets' @{ name = 'My set'; state = $state } $tokA
  Check 'save set ok' ($s1.code -eq 200 -and $s1.json.set.name -eq 'My set')
  Check 'invalid plan rejected' ((Call POST '/api/sets' @{ name = 'X'; state = @{ items = @(); plan = 'hack'; seats = 1 } } $tokA).json.error -eq 'invalid_set')
  Check 'empty name rejected' ((Call POST '/api/sets' @{ name = ' '; state = $state } $tokA).json.error -eq 'invalid_set')
  Check 'item without id rejected' ((Call POST '/api/sets' @{ name = 'X'; state = @{ items = @(@{ free = $true }); plan = 'team'; seats = 1 } } $tokA).code -eq 400)
  $list = Call GET '/api/sets' $null $tokA
  Check 'list returns own set with qty kept' ((@($list.json.sets).Count -eq 1) -and ($list.text -like '*"qty":2*'))
  $regB = Call POST '/api/register' @{ name = 'Bob'; email = 'bob@example.com'; password = 'secret12' }
  $tokB = $regB.json.token
  Check 'other user does not see my sets' (@((Call GET '/api/sets' $null $tokB).json.sets).Count -eq 0)
  Check 'other user cannot delete my set' ((Call DELETE ('/api/sets/' + $s1.json.set.id) $null $tokB).code -eq 404)
  Check 'owner can delete' ((Call DELETE ('/api/sets/' + $s1.json.set.id) $null $tokA).code -eq 200)
  Check 'set is gone' (@((Call GET '/api/sets' $null $tokA).json.sets).Count -eq 0)

  Write-Host 'Admin and roles'
  $good = @{ v = 2; upserts = @{ notion = @{ id = 'notion'; name = 'Notion'; category = 'productivity'; desc = 'd'; url = 'https://www.notion.com'; price = 500; studentDiscount = 100; team = $null } }; deleted = @('github') }
  Check 'overrides are public to read' ((Call GET '/api/catalog-overrides').code -eq 200)
  Check 'user cannot write overrides (403)' ((Call PUT '/api/catalog-overrides' $good $tokA).code -eq 403)
  Check 'guest cannot write overrides (401)' ((Call PUT '/api/catalog-overrides' $good).code -eq 401)
  Check 'user cannot make himself admin (role in body ignored)' ((Call POST '/api/register' @{ name = 'Eve'; email = 'eve@example.com'; password = 'secret12'; role = 'admin' }).json.user.role -eq 'user')
  $adm = Call POST '/api/login' @{ email = 'admin@subdog.local'; password = $adminPw }
  Check 'admin login ok' ($adm.code -eq 200 -and $adm.json.user.role -eq 'admin')
  $tokAdm = $adm.json.token
  Check 'default password does not work' ((Call POST '/api/login' @{ email = 'admin@subdog.local'; password = 'admin123' }).code -eq 401)
  Check 'admin writes overrides' ((Call PUT '/api/catalog-overrides' $good $tokAdm).code -eq 200)
  $got = Call GET '/api/catalog-overrides'
  Check 'overrides read back' ($got.json.overrides.v -eq 2 -and $got.json.overrides.upserts.notion.price -eq 500 -and @($got.json.overrides.deleted) -contains 'github')
  $bad1 = @{ v = 2; upserts = @{ x = @{ id = 'x'; name = 'X'; category = 'dev'; url = 'javascript:alert(1)'; price = 1 } }; deleted = @() }
  Check 'javascript: URL rejected' ((Call PUT '/api/catalog-overrides' $bad1 $tokAdm).json.error -eq 'invalid_catalog')
  $bad2 = @{ v = 2; upserts = @{ x = @{ id = 'x'; name = 'X'; category = 'dev'; url = 'https://e.com'; price = -5 } }; deleted = @() }
  Check 'negative price rejected' ((Call PUT '/api/catalog-overrides' $bad2 $tokAdm).code -eq 400)
  $bad3 = @{ v = 2; upserts = @{ x = @{ id = 'y'; name = 'X'; category = 'dev'; url = 'https://e.com'; price = 1 } }; deleted = @() }
  Check 'id/key mismatch rejected' ((Call PUT '/api/catalog-overrides' $bad3 $tokAdm).code -eq 400)
  Check 'wrong version rejected' ((Call PUT '/api/catalog-overrides' @{ v = 1; upserts = @{}; deleted = @() } $tokAdm).code -eq 400)
  Check 'user cannot reset overrides' ((Call DELETE '/api/catalog-overrides' $null $tokA).code -eq 403)
  Check 'admin resets overrides' ((Call DELETE '/api/catalog-overrides' $null $tokAdm).code -eq 200 -and $null -eq (Call GET '/api/catalog-overrides').json.overrides)

  Write-Host 'Limits'
  Check 'oversized body is 413' ((Call POST '/api/register' $null '' ('{"name":"' + ('a' * 2000000) + '"}')).code -eq 413)
  Check 'malformed JSON is 400' ((Call POST '/api/login' $null '' '{not json').code -eq 400)
  $lock = 0; for ($i = 0; $i -lt 7; $i++) { $x = Call POST '/api/login' @{ email = 'victim@example.com'; password = 'badbad1' }; if ($x.code -eq 429) { $lock++ } }
  Check 'brute force is rate-limited (429)' ($lock -ge 1)

  Write-Host 'Persistence'
  Call POST '/api/sets' @{ name = 'Persist'; state = $state } $tokA | Out-Null
  Stop-Srv; Start-Srv
  $again = Call POST '/api/login' @{ email = 'alice@example.com'; password = 'secret12' }
  Check 'account survives restart' ($again.code -eq 200)
  Check 'set survives restart' (@((Call GET '/api/sets' $null $again.json.token).json.sets).Count -eq 1)
  Check 'old token is invalid after restart' ((Call GET '/api/me' $null $tokA).code -eq 401)
}
finally {
  Stop-Srv
  if (Test-Path $tmp) { Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue }
}
Write-Host ""
Write-Host ("Passed: " + $script:pass + "  Failed: " + $script:fail) -ForegroundColor $(if ($script:fail) { 'Red' } else { 'Green' })
if ($script:fail) { exit 1 }
