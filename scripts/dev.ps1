$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'env.ps1')
Set-Location -LiteralPath $script:KeyeProjectRoot
if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
    throw '项目内 Rust 工具链尚未安装，请参阅 docs/DEVELOPMENT.md。'
}
npm run tauri:dev
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
