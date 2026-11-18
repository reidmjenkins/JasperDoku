@echo off
cd /d "%~dp0"
start "" http://localhost:5177
node tools\serve.js
