param(
  [switch]$ResetDb = $false,
  [switch]$ReapplySql = $false
)

# ==== Paths ===================================================================
$ROOT   = "C:\Users\27768\Downloads\streamhive-final-sprint1\streamhive-final"
$SCHEMA = Join-Path $ROOT "services\core-ledger\db\001_schema.sql"
$SEED   = Join-Path $ROOT "services\core-ledger\db\002_seed.sql"
$OUTPS1 = Join-Path $ROOT "services\out\New-AuditPack.ps1"
$PACKPS = Join-Path $ROOT "services\core-ledger\out\New-AuditPack.ps1"
$ENVF   = Join-Path $ROOT ".env"

# ==== Ensure Docker Desktop is running (ignore noisy stderr warnings) =========
Write-Host "Starting Docker Desktop (if needed)..." -ForegroundColor Cyan
$dockerExe = "C:\Program Files\Docker\Docker\Docker Desktop.exe"
if (-not (Get-Process -Name "Docker Desktop" -ErrorAction SilentlyContinue)) {
  Start-Process $dockerExe
}

# Wait for engine without surfacing stderr as an error
$tries = 120
while ($tries-- -gt 0) {
  cmd /c "docker info >nul 2>nul"
  if ($LASTEXITCODE -eq 0) { break }
  Start-Sleep -Seconds 2
}
cmd /c "docker context use desktop-linux >nul 2>nul"

# From this point on, treat real errors as fatal
$ErrorActionPreference = "Stop"

# ==== Redis @ 6380 ============================================================
Write-Host "Ensuring sh-redis @ 6380..." -ForegroundColor Cyan
if ($(docker ps -q -f name=^/sh-redis$)) { }
elseif ($(docker ps -a -q -f name=^/sh-redis$)) { docker start sh-redis | Out-Null }
else { docker run -d --name sh-redis -p 6380:6379 redis:7-alpine | Out-Null }

# ==== Postgres @ 5434 =========================================================
Write-Host "Ensuring sh-postgres @ 5434..." -ForegroundColor Cyan
if ($ResetDb -and $(docker ps -a -q -f name=^/sh-postgres$)) {
  Write-Host "ResetDb requested: removing sh-postgres + volume sh_pgdata" -ForegroundColor Yellow
  docker rm -f sh-postgres 2>$null | Out-Null
  docker volume rm sh_pgdata 2>$null | Out-Null
}
if ($(docker ps -q -f name=^/sh-postgres$)) { }
elseif ($(docker ps -a -q -f name=^/sh-postgres$)) { docker start sh-postgres | Out-Null }
else {
  docker run -d --name sh-postgres `
    -e POSTGRES_PASSWORD=postgres `
    -e POSTGRES_USER=postgres `
    -e POSTGRES_DB=streamhive `
    -p 5434:5432 `
    -v sh_pgdata:/var/lib/postgresql/data `
    postgres:16-alpine | Out-Null
}

# Wait until DB answers
$tries=90; while($tries-- -gt 0){ docker exec sh-postgres pg_isready -U postgres -d streamhive *> $null; if($LASTEXITCODE -eq 0){ break }; Start-Sleep 2 }

# ==== Schema + seed ===========================================================
if ($ReapplySql -or -not (docker exec -it sh-postgres psql -U postgres -d streamhive -c "SELECT 1 FROM information_schema.tables WHERE table_name='transactions';" 2>$null)) {
  Write-Host "Applying schema + seed..." -ForegroundColor Cyan
  Get-Content $SCHEMA -Raw | docker exec -i sh-postgres psql -U postgres -d streamhive -v ON_ERROR_STOP=1 -1
  Get-Content $SEED   -Raw | docker exec -i sh-postgres psql -U postgres -d streamhive -v ON_ERROR_STOP=1 -1
}

# ==== .env sync ===============================================================
Write-Host "Syncing .env..." -ForegroundColor Cyan
if (-not (Test-Path $ENVF)) { New-Item -ItemType File -Path $ENVF | Out-Null }
$content = Get-Content $ENVF -Raw
foreach($k in "POSTGRES_URL","REDIS_URL","MAIL_FETCH_ENABLED"){
  $content = [regex]::Replace($content, "(?m)^$k=.*\r?\n?", "")
}
$content = ($content.TrimEnd() + "`r`nPOSTGRES_URL=postgresql://postgres:postgres@localhost:5434/streamhive`r`nREDIS_URL=redis://localhost:6380`r`nMAIL_FETCH_ENABLED=false`r`n")
Set-Content $ENVF $content -Encoding UTF8

# ==== mediamtx via compose ====================================================
Write-Host "Starting mediamtx via compose..." -ForegroundColor Cyan
Push-Location $ROOT
docker compose up -d mediamtx
Pop-Location

# ==== place packer ============================================================
Write-Host "Placing New-AuditPack.ps1..." -ForegroundColor Cyan
New-Item -ItemType Directory -Force -Path (Split-Path $OUTPS1) | Out-Null
Copy-Item $PACKPS $OUTPS1 -Force

# Session env for Node tools
$env:PGHOST="localhost"; $env:PGPORT="5434"; $env:PGUSER="postgres"; $env:PGPASSWORD="postgres"; $env:PGDATABASE="streamhive"
$env:REDIS_URL="redis://localhost:6380"

# ==== Smoke tests =============================================================
Write-Host "`n=== Smoke tests ===" -ForegroundColor Green
docker exec -it sh-redis redis-cli PING
docker exec -it sh-postgres psql -U postgres -d streamhive -c "SELECT now();"
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

Write-Host "`nDone. Next:" -ForegroundColor Green
Write-Host "• (Optional) OPEN A NEW TERMINAL to tail logs:" -ForegroundColor Yellow
Write-Host "    docker logs -f sh-postgres"
Write-Host "    docker logs -f sh-redis"
Write-Host "    docker compose logs -f mediamtx"
Write-Host "• Build an audit pack (same terminal is fine):" -ForegroundColor Yellow
Write-Host "    cd `"$ROOT\services\core-ledger`""
Write-Host "    npx ts-node src\cli\generateAuditPack.ts --from 2025-01-01 --to 2025-06-30 --scope ITR14 --client streamhive" -ForegroundColor Gray
