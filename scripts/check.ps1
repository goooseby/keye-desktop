$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'env.ps1')
Set-Location -LiteralPath $script:KeyeProjectRoot
npm run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
if (Get-Command cargo -ErrorAction SilentlyContinue) {
    cargo check --manifest-path src-tauri/Cargo.toml
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} else {
    Write-Warning 'The project-local Rust toolchain is missing; only the frontend was checked.'
}
