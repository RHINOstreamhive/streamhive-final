param(
  [string]$From   = "2025-01-01",
  [string]$To     = "2025-06-30",
  [string]$Scope  = "ITR14",
  [string]$Client = "streamhive"
)

$ROOT = "C:\Users\27768\Downloads\streamhive-final-sprint1\streamhive-final"

# Session DB env expected by TS script
$env:PGHOST="localhost"; $env:PGPORT="5434"; $env:PGUSER="postgres"; $env:PGPASSWORD="postgres"; $env:PGDATABASE="streamhive"

# Ensure packer location
New-Item -ItemType Directory -Force -Path "$ROOT\services\out" | Out-Null
Copy-Item "$ROOT\services\core-ledger\out\New-AuditPack.ps1" "$ROOT\services\out\New-AuditPack.ps1" -Force

Push-Location "$ROOT\services\core-ledger"
npx ts-node src\cli\generateAuditPack.ts --from $From --to $To --scope $Scope --client $Client
Pop-Location
