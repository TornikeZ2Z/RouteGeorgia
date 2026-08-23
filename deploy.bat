@echo off
rem ============================================================
rem  RouteGeorgia — one-click deploy
rem  Runs the ship script: typecheck + all tests, then commit
rem  and push. Render deploys automatically after the push.
rem  If tests fail, nothing is published.
rem ============================================================
cd /d "%~dp0"

rem Clear stale git lock files (harmless if none exist)
del /q .git\index.lock 2>nul
del /q .git\HEAD.lock 2>nul
del /q .git\objects\maintenance.lock 2>nul

call npm run ship

echo.
echo ------------------------------------------------------------
echo  Push finished. Render builds for ~5-6 minutes, then the
echo  changes are live at https://routegeorgia.ge
echo ------------------------------------------------------------
pause
