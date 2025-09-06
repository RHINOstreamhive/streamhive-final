param(
  [Parameter(Mandatory=$true)][string]$Client,
  [Parameter(Mandatory=$true)][string]$From,
  [Parameter(Mandatory=$true)][string]$To,
  [string]$Scope = "ITR14"
)

$OutBase = $PSScriptRoot
$PackRoot = Join-Path $OutBase "$Client\$($From)_$($To)\$Scope"
New-Item -ItemType Directory -Force -Path $PackRoot | Out-Null

$DestBuilder = Join-Path $PackRoot "build-pack.ps1"
$PrevBuilder = Get-ChildItem -Path (Join-Path $OutBase $Client) -Recurse -Filter build-pack.ps1 -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Desc | Select-Object -First 1 -ExpandProperty FullName

if ($PrevBuilder -and ($PrevBuilder -ne $DestBuilder)) {
  Copy-Item $PrevBuilder -Destination $DestBuilder -Force
}

if (-not (Test-Path $DestBuilder)) {
@"
param([string]`$Client,[string]`$From,[string]`$To,[string]`$Scope)
function Get-TypeFromExt(`$ext){ switch (`$ext.ToLower()){".csv"{"csv";break}".xlsx"{"excel";break}".xls"{"excel";break}".pdf"{"pdf";break} default{(`$ext.TrimStart('.').ToLower())}}}
`$docFiles = Get-ChildItem -File | Where-Object { `$_.Name -notmatch '^index\.' -and `$_.Extension -ne '.zip' -and `$_.Name -ne 'build-pack.ps1' } | Sort-Object Name
if(-not `$docFiles){ Write-Host "No documents found." -ForegroundColor Yellow; exit 1 }
`$zipName = "AuditPack-`$Client-`$From-`$To-`$Scope.zip"
Compress-Archive -Path `$docFiles.FullName -DestinationPath `$zipName -Force
`$documents = foreach(`$f in `$docFiles){[pscustomobject]@{name=`$f.Name;path=`$f.Name;type=(Get-TypeFromExt `$f.Extension);sizeBytes=[int64]`$f.Length;sha256=(Get-FileHash -Algorithm SHA256 -LiteralPath `$f.FullName).Hash.ToLower();requiredBy=`$Scope}}
`$zip = Get-Item `$zipName; `$zipInfo=[pscustomobject]@{name=`$zip.Name;path=`$zip.Name;sizeBytes=[int64]`$zip.Length;sha256=(Get-FileHash -Algorithm SHA256 -LiteralPath `$zip.FullName).Hash.ToLower()}
`$indexObj=[ordered]@{client=`$Client;from=`$From;to=`$To;scope=`$Scope;generatedAt=(Get-Date).ToUniversalTime().ToString("o");documents=`$documents;zip=`$zipInfo;status="complete"}
`$indexObj | ConvertTo-Json -Depth 8 | Set-Content -Path ".\index.json" -Encoding UTF8
`$idxHash=(Get-FileHash -Algorithm SHA256 -LiteralPath ".\index.json").Hash.ToLower()
`$idxHash | Set-Content -Path ".\index.sha256.txt" -Encoding ASCII
Write-Host "index.json SHA-256: `$idxHash" -ForegroundColor Yellow
"@ | Set-Content -Path $DestBuilder -Encoding UTF8
}

Set-Location $PackRoot
Write-Host "Drop your PDFs/XLSX/CSV into: $PackRoot" -ForegroundColor Cyan
.\build-pack.ps1 -Client $Client -From $From -To $To -Scope $Scope

"`nVerification:"
"index.json => " + (Get-FileHash .\index.json -Algorithm SHA256).Hash.ToLower()
"index.sha256.txt => " + (Get-Content .\index.sha256.txt).Trim()
