# Updates the self-hosted portal on the server to the latest commit on main.
#
#   powershell -ExecutionPolicy Bypass -File D:\mkttickets\scripts\deploy.ps1
#
# Pulls from GitHub, installs any new dependencies, rebuilds the frontend for
# single-origin serving, and restarts the app service. Stops at the first
# failure so a broken build never replaces a working one: the old dist stays
# in place until vite has finished writing the new one, and the service is
# only restarted after a successful build.
#
# Assumes the layout from docs/SELF-HOSTING.md: repo at the folder this script
# lives in, app running as the NSSM service "mkttickets". Set MKT_SERVICE to
# use a different service name, or MKT_NO_RESTART=1 to skip the restart.

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$service = if ($env:MKT_SERVICE) { $env:MKT_SERVICE } else { 'mkttickets' }

function Step($name, [scriptblock]$body) {
  Write-Host ""
  Write-Host "== $name" -ForegroundColor Cyan
  & $body
  if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) { throw "$name failed (exit $LASTEXITCODE)" }
}

Set-Location $root
$before = git rev-parse --short HEAD

Step "Pull main" { git pull --ff-only origin main }

$after = git rev-parse --short HEAD
if ($before -eq $after) {
  Write-Host "Already at $after; nothing new on main. Rebuilding anyway in case dependencies or env changed."
} else {
  Write-Host "Updated $before -> $after"
  git --no-pager log --oneline "$before..$after"
}

Step "Backend dependencies" { npm install --prefix "$root\backend" --no-audit --no-fund }
Step "Frontend dependencies" { npm install --prefix "$root\frontend" --no-audit --no-fund }
Step "Build frontend" { Set-Location "$root\backend"; npm run build:frontend; Set-Location $root }

# A migration script that arrived with this pull is not run automatically:
# schema changes are applied by hand with psql, then PostgREST is told to
# reload. Point them out so they are not missed.
$newSql = git diff --name-only "$before..$after" -- backend/database/*.sql 2>$null
if ($newSql) {
  Write-Host ""
  Write-Host "New or changed migration scripts in this update:" -ForegroundColor Yellow
  $newSql | ForEach-Object { Write-Host "  $_" }
  Write-Host "Apply with:  psql -U postgres -d mkttickets -f <file>" -ForegroundColor Yellow
  Write-Host "Then:        psql -U postgres -d mkttickets -c `"notify pgrst, 'reload schema';`"" -ForegroundColor Yellow
}

if ($env:MKT_NO_RESTART -eq '1') {
  Write-Host ""
  Write-Host "MKT_NO_RESTART=1: not restarting $service."
} else {
  Step "Restart $service" {
    if (Get-Command nssm -ErrorAction SilentlyContinue) {
      nssm restart $service | Out-Null
      Start-Sleep -Seconds 3
      nssm status $service
    } elseif (Get-Command pm2 -ErrorAction SilentlyContinue) {
      pm2 restart $service
    } else {
      Write-Host "Neither nssm nor pm2 found; restart the app yourself." -ForegroundColor Yellow
    }
  }
}

Write-Host ""
Write-Host "Deployed $after." -ForegroundColor Green
