param([switch]$ComposeAlso)

$ROOT = "C:\Users\27768\Downloads\streamhive-final-sprint1\streamhive-final"

function Open-Tab($Title, $Cmd){
  if (Get-Command wt.exe -ErrorAction SilentlyContinue) {
    wt -w 0 nt --title $Title powershell -NoExit -Command $Cmd | Out-Null
  } else {
    Start-Process powershell -ArgumentList "-NoExit","-Command",$Cmd | Out-Null
  }
}

Open-Tab "sh-postgres" 'docker logs -f sh-postgres'
Open-Tab "sh-redis"    'docker logs -f sh-redis'
if ($ComposeAlso) { Open-Tab "mediamtx"   'docker compose logs -f mediamtx' }
