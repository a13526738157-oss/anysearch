@echo off
setlocal
for /f "tokens=1 delims==" %%A in ('set NODE_ 2^>nul') do set "%%A="
for /f "tokens=1 delims==" %%A in ('set ELECTRON_ 2^>nul') do set "%%A="
"%~dp0runtime\node\node.exe" --no-global-search-paths "%~dp0dist\release\launch.cjs" %*
exit /b %errorlevel%
