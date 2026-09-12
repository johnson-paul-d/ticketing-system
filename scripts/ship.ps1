# Releases the current work: stages everything, commits, pushes main.
# The push triggers .github/workflows/deploy.yml, which deploys to the server.
#
#   powershell -ExecutionPolicy Bypass -File scripts\ship.ps1 "Fix tax amount on approval"
#
# One deliberate command rather than auto-push on save: pushing main deploys
# to production, so it should happen when you decide the change is ready, not
# every time the editor writes a file. Refuses to run from any branch other
# than main and stops if there is nothing to commit.

param([Parameter(Mandatory = $true, Position = 0)][string]$Message)

$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)

$branch = git rev-parse --abbrev-ref HEAD
if ($branch -ne 'main') { throw "On branch '$branch'. Switch to main before shipping." }

git add -A
$staged = git diff --cached --name-only
if (-not $staged) { Write-Host 'Nothing to commit.'; exit 0 }

# Belt and braces: .env files are git-ignored, but a renamed copy would not be.
$secrets = $staged | Where-Object { $_ -match '(^|/)\.env(\.|$)' -and $_ -notmatch '\.example$' }
if ($secrets) { git reset -q; throw "Refusing to commit files that look like secrets:`n  $($secrets -join "`n  ")" }

Write-Host "Committing $($staged.Count) file(s):" -ForegroundColor Cyan
$staged | ForEach-Object { "  $_" }
git commit -q -m $Message
git pull --rebase --quiet origin main
git push origin main
Write-Host "Pushed $(git rev-parse --short HEAD). The server deploys it within a minute or two; watch the Actions tab." -ForegroundColor Green
