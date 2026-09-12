# Rebuilds the development database on the server from the latest nightly
# backup of production, so a developer's laptop works against realistic data
# without ever touching the live database.
#
#   powershell -ExecutionPolicy Bypass -File D:\mkttickets\backend\scripts\db\refresh-dev.ps1
#
# Drops mkttickets_dev, recreates it, restores the newest db-*.dump from the
# backup folder, re-applies the PostgREST roles and grants, and tells the dev
# PostgREST to reload its schema. Everything in the dev database is discarded;
# that is the point.
#
# Uses the same password file the backup task uses (PGPASSFILE), so it can run
# unattended or from a scheduled task.

$ErrorActionPreference = 'Stop'

$dev = 'mkttickets_dev'
$backups = if ($env:MKT_BACKUP_DIR) { $env:MKT_BACKUP_DIR } else { 'D:\backups\mkttickets' }
$env:PGPASSFILE = 'C:\ProgramData\mkttickets\pgpass.conf'
$here = $PSScriptRoot

$bin = (Get-ChildItem "C:\Program Files\PostgreSQL\*\bin" | Select-Object -First 1).FullName
if (-not $bin) { throw 'PostgreSQL bin folder not found under C:\Program Files\PostgreSQL' }

$dump = Get-ChildItem "$backups\db-*.dump" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $dump) { throw "No db-*.dump found in $backups - run the mkttickets-backup task first" }
Write-Host "Restoring $($dump.Name) ($([math]::Round($dump.Length/1MB,1)) MB) into $dev"

# Kick off anyone connected (the dev PostgREST holds a pool), then recreate.
& "$bin\psql.exe" -U postgres -d postgres -q -c "select pg_terminate_backend(pid) from pg_stat_activity where datname = '$dev' and pid <> pg_backend_pid();"
& "$bin\psql.exe" -U postgres -d postgres -q -c "drop database if exists $dev;"
& "$bin\psql.exe" -U postgres -d postgres -q -c "create database $dev;"
& "$bin\psql.exe" -U postgres -d $dev -q -f "$here\01-prepare.sql" 2>&1 | Where-Object { $_ -notmatch 'ALTER DATABASE' }
& "$bin\psql.exe" -U postgres -d $dev -q -c "alter database $dev set timezone to 'UTC';"

# Restore; the only expected complaint is "schema public already exists".
& "$bin\pg_restore.exe" -U postgres -d $dev --no-owner --no-privileges $dump.FullName 2>&1 |
  Where-Object { $_ -and $_ -notmatch 'schema "public" already exists|CREATE SCHEMA public|errors ignored on restore' } |
  ForEach-Object { Write-Host $_ }

& "$bin\psql.exe" -U postgres -d $dev -q -f "$here\02-postgrest-roles.sql" | Out-Null

$counts = & "$bin\psql.exe" -U postgres -d $dev -At -c "select (select count(*) from users) || ' users, ' || (select count(*) from tickets) || ' tickets, ' || (select count(*) from expense_lines) || ' expense lines';"
Write-Host "Dev database ready: $counts" -ForegroundColor Green
