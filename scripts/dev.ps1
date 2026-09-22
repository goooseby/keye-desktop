$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'env.ps1')
& (Join-Path $PSScriptRoot 'get-pdfium.ps1')
Set-Location -LiteralPath $script:KeyeProjectRoot
if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
    throw "Rust toolchain is not installed. Please refer to docs/DEVELOPMENT.md"
}
npm run tauri:dev
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
