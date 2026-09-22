$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'env.ps1')
Set-Location -LiteralPath $script:KeyeProjectRoot
npm run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
if (Get-Command cargo -ErrorAction SilentlyContinue) {
    cargo check --manifest-path src-tauri/Cargo.toml
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} else {
    Write-Warning '未找到项目内 Rust 工具链，仅完成前端构建。'
}
