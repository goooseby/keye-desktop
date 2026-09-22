$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'env.ps1')
Set-Location -LiteralPath $script:KeyeProjectRoot

$key = Join-Path $script:KeyeProjectRoot '.secrets\keye-updater.key'
if (-not (Test-Path -LiteralPath $key)) { throw 'Updater signing key is missing. See docs/DISTRIBUTION.md.' }
$passwordFile = Join-Path $script:KeyeProjectRoot '.secrets\keye-updater.password'
if (-not (Test-Path -LiteralPath $passwordFile)) { throw 'Updater key password is missing. See docs/DISTRIBUTION.md.' }
& (Join-Path $PSScriptRoot 'get-pdfium.ps1')

$env:TAURI_SIGNING_PRIVATE_KEY = $key
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = (Get-Content -Raw -Encoding UTF8 -LiteralPath $passwordFile).Trim()
try {
    npx tauri build --bundles nsis --config src-tauri/tauri.package.conf.json
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    & (Join-Path $PSScriptRoot 'release-manifest.ps1')
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally {
    Remove-Item Env:\TAURI_SIGNING_PRIVATE_KEY -ErrorAction SilentlyContinue
    Remove-Item Env:\TAURI_SIGNING_PRIVATE_KEY_PASSWORD -ErrorAction SilentlyContinue
}
