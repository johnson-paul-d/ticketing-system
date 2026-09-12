# Self-hosting the portal on your own server

Everything the portal needs on one Windows machine: the app, the database and
the files, published through a Cloudflare Tunnel. Nothing stays on Supabase,
Google Drive, Render or Vercel once this is done.

```
Cloudflare Tunnel  →  Node app (port 8020)  →  PostgREST (127.0.0.1:3001)  →  PostgreSQL (5432)
                              │
                              └─→  receipts and signatures on local disk
```

The app talks to PostgREST exactly as it talked to Supabase, because Supabase
is PostgREST underneath. No route changes; one file (`config/supabase.js`)
strips a URL prefix when `POSTGREST_URL` is set.

Do the steps in order. Each one can be checked before the next.

## 0. What you need from Supabase first

Supabase → your project → **Project Settings → Database**.

- **Database password.** If you never noted it, use *Reset database password*.
- **Connection string** in *Session* pooler mode, port 5432. It looks like
  `postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres`.
  The pooler is the one that works over IPv4; the direct host is IPv6-only.

## 1. Install PostgreSQL on the server

Install **PostgreSQL 17 or 18** from the EDB installer (postgresql.org/download/windows).
Note the `postgres` password you set. Tick *Command Line Tools*; they provide
`psql`, `pg_dump`, `pg_restore`, `createdb`. The installer does not put them
on PATH. For the current window:

```powershell
$env:Path += ";" + (Get-ChildItem "C:\Program Files\PostgreSQL\*\bin" | Select-Object -First 1).FullName; psql --version
```

To avoid a password prompt on every command in that window:

```powershell
$env:PGPASSWORD = "<the postgres password>"
```

Create the database and prepare it:

```powershell
createdb -U postgres mkttickets
psql -U postgres -d mkttickets -f D:\mkttickets\backend\scripts\db\01-prepare.sql
```

## 2. Copy the data across

On the server, dump straight from Supabase into a file, then restore it:

```powershell
pg_dump "postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres" --schema=public --no-owner --no-privileges --format=custom --file=D:\mkttickets\supabase.dump
```

```powershell
pg_restore -U postgres -d mkttickets --no-owner --no-privileges D:\mkttickets\supabase.dump
```

One error is expected and harmless: "schema public already exists" (every new
database has one; the dump tries to create it again). Warnings about
extensions or `supabase_` roles are likewise fine. The dump file holds your
whole database: keep it, and keep it private.

If the Supabase password contains `@`, `%`, `#` or `/`, percent-encode it in
the string (`@` is `%40`, `%` is `%25`).

Then create the roles PostgREST uses:

```powershell
psql -U postgres -d mkttickets -f D:\mkttickets\backend\scripts\db\02-postgrest-roles.sql
psql -U postgres -d mkttickets -c "alter role authenticator with password '<long random password A>';"
```

## 3. Install PostgREST

1. Download the Windows zip from github.com/PostgREST/postgrest/releases
   (named like `postgrest-v16.3-windows-x86-64.zip`) and unzip `postgrest.exe`
   into `D:\postgrest\`. The Windows build needs PostgreSQL's client DLLs
   beside it, or it exits silently with code -1073741515 (DLL not found):

   ```powershell
   Copy-Item "C:\Program Files\PostgreSQL\18\bin\*.dll" D:\postgrest\; D:\postgrest\postgrest.exe --version
   ```
2. Copy `backend\scripts\db\postgrest.conf.example` there as `postgrest.conf`.
   Put password A into `db-uri` and a random string of at least 32 characters
   into `jwt-secret` (call it secret B).
3. Try it once in a window: `D:\postgrest\postgrest.exe D:\postgrest\postgrest.conf`.
   It should print that it connected and is listening on 3001. Ctrl+C.
4. Run it as a service with NSSM (nssm.cc):

```powershell
nssm install postgrest D:\postgrest\postgrest.exe D:\postgrest\postgrest.conf
nssm set postgrest AppDirectory D:\postgrest
nssm set postgrest DependOnService postgresql-x64-18
nssm start postgrest
```

Check: `curl http://127.0.0.1:3001/` returns JSON describing the tables.

## 4. Point the app at it

Mint the app's token from secret B:

```powershell
cd D:\mkttickets\backend; node scripts\db\mint-service-jwt.js "<secret B>"
```

Add to `D:\mkttickets\backend\.env`:

```
POSTGREST_URL=http://127.0.0.1:3001
POSTGREST_JWT=<the token printed above>
```

Leave `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in place for now: the
comparison in step 5 needs both sides. Restart the app (`pm2 restart mkttickets`
or Ctrl+C and `npm start`). The log shows which database it chose.

## 5. Prove the copy

```powershell
cd D:\mkttickets\backend; node scripts\db\compare-counts.js
```

Every table must show the same count on both sides. If anything was written
on the old side after the dump (people were still using the portal), repeat
step 2 from the dump onwards: drop and recreate the database first with
`dropdb -U postgres mkttickets` then `createdb`, `01-prepare`, restore,
`02-postgrest-roles`.

The clean way is to do the dump at a quiet time, switch the app to the new
database straight after, and run the comparison then.

## 6. Move receipts and signatures off Google Drive

With the app now on the local database:

```powershell
cd D:\mkttickets\backend
node scripts\migrate-files-to-local.js --dry-run
node scripts\migrate-files-to-local.js
```

Files land in `D:\mkttickets\backend\data\files` (change with
`FILE_STORE_DIR`). Every receipt is checked against the sha256 already on its
row before its record is repointed, so a signed document can never end up
attesting to different bytes. Nothing is deleted from Drive.

Then set in `.env`:

```
FILE_STORE=local
```

Restart the app. Open a claim and view a receipt; open Settings → My
Signature. Both should render from disk.

## 7. Finish

- Remove `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and the `GOOGLE_*` lines
  from `.env` once everything works, and restart. The app refuses to start
  without a database, so a typo here is caught immediately.
- Pause the Supabase project and the Render service; delete the Vercel project.
- Keep the Google Drive folder for a month, then delete it.

## Running it day to day

**Backups.** The database is now your responsibility. Nightly dump via Task
Scheduler, kept somewhere other than the server:

```powershell
pg_dump -U postgres -d mkttickets --format=custom --file="E:\backups\mkttickets-$(Get-Date -Format yyyy-MM-dd).dump"
```

Back up `backend\data\files` alongside it. Test a restore once.

**Schema changes.** The SQL files in `backend\database\` are run the same way
as before, with `psql -U postgres -d mkttickets -f <file>`. PostgREST caches
the schema, so after any migration run:

```powershell
psql -U postgres -d mkttickets -c "notify pgrst, 'reload schema';"
```

Without that, new columns answer with a PGRST204 "column not found" until the
service restarts.

**Updating the app.** One command pulls main, installs dependencies, rebuilds
the frontend and restarts the service. It stops at the first failure, so a
broken build never replaces the running one:

```powershell
powershell -ExecutionPolicy Bypass -File D:\mkttickets\scripts\deploy.ps1
```

It lists any migration scripts that arrived with the update; apply those by
hand as described below.

**Services that must be running:** `postgresql-x64-18` (the number follows
the installed version), `postgrest`, the app (`pm2` or NSSM), and
`cloudflared`.

## Development database for laptops

Nothing runs or is stored on a developer's laptop except the code. The laptop
runs the app locally, but its database is a **second database on the server**,
`mkttickets_dev`, rebuilt from the nightly backup on demand. A second PostgREST
serves it on port 3002 on a private network address, and the laptop's
`backend/.env` points there. Production stays on 127.0.0.1:3001 and cannot be
reached from anywhere else.

**Once, on the server.** Pick the address the laptop will use: the server's
Tailscale address if both machines are on Tailscale (works from anywhere), or
its office LAN address (works in the office only). Then:

```powershell
powershell -ExecutionPolicy Bypass -File D:\mkttickets\backend\scripts\db\refresh-dev.ps1
```

```powershell
Set-Content -Path D:\postgrest\postgrest-dev.conf -Encoding ascii -Value @('db-uri = "postgres://authenticator:<password A>@127.0.0.1:5432/mkttickets_dev"', 'db-schemas = "public"', 'db-anon-role = "anon"', 'jwt-secret = "<a different secret of 32+ characters, secret C>"', 'server-host = "<the chosen address>"', 'server-port = 3002', 'db-pool = 5', 'db-channel-enabled = true')
```

```powershell
nssm install postgrest-dev D:\postgrest\postgrest.exe D:\postgrest\postgrest-dev.conf; nssm set postgrest-dev AppDirectory D:\postgrest; nssm set postgrest-dev DependOnService postgresql-x64-18; nssm start postgrest-dev
```

If the chosen address is on the office LAN, allow the port through Windows
Firewall for that network only:

```powershell
New-NetFirewallRule -DisplayName "PostgREST dev 3002" -Direction Inbound -Protocol TCP -LocalPort 3002 -Profile Private -Action Allow
```

Mint the laptop's token from secret C, not from the production secret:

```powershell
cd D:\mkttickets\backend; node scripts\db\mint-service-jwt.js "<secret C>"
```

**On the laptop**, in `backend/.env`:

```
POSTGREST_URL=http://<the chosen address>:3002
POSTGREST_JWT=<the dev token>
FILE_STORE=local
```

Uploads made during development land on the laptop's own disk under
`backend/data/files`, which is git-ignored. Receipts restored from the backup
point at the server's files and will not open on the laptop; that is expected.

**Refreshing dev data.** Re-run `refresh-dev.ps1` on the server whenever you
want the dev database reset to last night's production. Everything in it is
discarded.

## What is different from Supabase

- No 1000-row response cap. The app pages explicitly and does not depend on it.
- Timestamps are rendered in UTC by the database role settings in the SQL
  scripts, matching Supabase. Do not change the machine's PostgreSQL
  `timezone` for this database.
- `POSTGREST_JWT` has no expiry, like a Supabase service-role key. Rotate it by
  changing `jwt-secret` in `postgrest.conf`, minting a new token, and
  restarting both services.
- PostgREST listens on 127.0.0.1 only. Never expose port 3001 or 5432 through
  the tunnel; the app is the only client.
