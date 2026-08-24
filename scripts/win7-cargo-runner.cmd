@echo off
setlocal

if not "%PCIE_WIN7_BUILD%"=="1" (
  echo Win7 Cargo launcher requires PCIE_WIN7_BUILD=1 1>&2
  exit /b 1
)

node "%~dp0win7-cargo-runner.mjs" %*
exit /b %errorlevel%
