@echo off
cd /d "%~dp0"
"C:\Program Files\nodejs\npm.cmd" run sink:email:watch
