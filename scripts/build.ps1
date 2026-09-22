$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'env.ps1')
Set-Location -LiteralPath $script:KeyeProjectRoot
if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
    throw 'The project-local Rust toolchain is missing. See docs/DEVELOPMENT.md.'
}
npm run tauri:build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
