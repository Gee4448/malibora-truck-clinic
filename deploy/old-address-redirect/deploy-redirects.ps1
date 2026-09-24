# Re-claims the three deleted Vercel addresses as redirect-only projects that
# forward to https://malibora-clinic.vercel.app and retire the old cached app.
$ErrorActionPreference = 'Continue'
$Here = Split-Path -Parent $MyInvocation.MyCommand.Path
$Projects = @('malibora-truck-clinic', 'malibora-truck-clinic-app', 'malibora-truck-clinic-vvxn')

foreach ($P in $Projects) {
  Write-Host ""
  Write-Host "=== $P ===" -ForegroundColor Cyan
  $Dir = Join-Path $Here $P
  if (Test-Path $Dir) { Remove-Item -Recurse -Force $Dir }
  Copy-Item -Recurse (Join-Path $Here 'src') $Dir
  Set-Location $Dir
  npx vercel project add $P
  npx vercel link --yes --project $P
  npx vercel deploy --prod --yes
  Set-Location $Here
}

Write-Host ""
Write-Host "=== Check (expect 307 -> malibora-clinic, and 200 for sw.js) ===" -ForegroundColor Cyan
foreach ($P in $Projects) {
  try {
    $r = Invoke-WebRequest -Uri "https://$P.vercel.app/admin/login" -MaximumRedirection 0 -UseBasicParsing -ErrorAction Stop
    Write-Host "$P  /admin/login: $($r.StatusCode) -> $($r.Headers.Location)"
  } catch {
    $resp = $_.Exception.Response
    if ($resp) { Write-Host "$P  /admin/login: $([int]$resp.StatusCode) -> $($resp.Headers['Location'])" }
    else { Write-Host "$P  /admin/login: $($_.Exception.Message)" }
  }
  try {
    $s = Invoke-WebRequest -Uri "https://$P.vercel.app/sw.js" -UseBasicParsing -ErrorAction Stop
    Write-Host "$P  /sw.js:       $($s.StatusCode)"
  } catch {
    Write-Host "$P  /sw.js:       $($_.Exception.Message)"
  }
}
