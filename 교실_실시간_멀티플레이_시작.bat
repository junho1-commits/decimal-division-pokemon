@echo off
chcp 65001 >nul
title Pokemon GO Math Multiplayer Server
cd /d "%~dp0"
where node >nul 2>nul
if not errorlevel 1 (
  node server.cjs
  goto done
)
if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" (
  "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" server.cjs
  goto done
)
where py >nul 2>nul
if not errorlevel 1 (
  py -3 server.py
  goto done
)
where python >nul 2>nul
if not errorlevel 1 (
  python server.py
  goto done
)
echo Node.js or Python 3 is required to run the local classroom server.
:done
pause
