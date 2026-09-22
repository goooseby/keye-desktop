$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'env.ps1')
$config = Get-Content -Raw -Encoding UTF8 (Join-Path $script:KeyeProjectRoot 'src-tauri\tauri.conf.json') | ConvertFrom-Json
$version = $config.version
$bundleDir = Join-Path $script:KeyeProjectRoot '.build\cargo\release\bundle\nsis'
$source = Join-Path $bundleDir "$($config.productName)_${version}_x64-setup.exe"
$sourceSignature = "$source.sig"
if (-not (Test-Path -LiteralPath $source)) { throw "No NSIS installer found for version $version." }
if (-not (Test-Path -LiteralPath $sourceSignature)) { throw 'The installer signature is missing.' }
# GitHub normalizes non-ASCII asset names. Publish an ASCII copy so the updater URL stays stable.
$assetName = "Keye_${version}_x64-setup.exe"
$assetPath = Join-Path $bundleDir $assetName
$signaturePath = "$assetPath.sig"
Copy-Item -LiteralPath $source -Destination $assetPath -Force
Copy-Item -LiteralPath $sourceSignature -Destination $signaturePath -Force
$installer = Get-Item -LiteralPath $assetPath
$signature = (Get-Content -Raw -Encoding UTF8 -LiteralPath $signaturePath).Trim()
if (-not $signature) { throw 'The installer signature is empty.' }
$url = "https://github.com/goooseby/keye-desktop/releases/download/v$version/$assetName"
$manifest = @{
    version = $version
    notes = 'See the GitHub release notes.'
    size = $installer.Length
    platforms = @{ 'windows-x86_64' = @{ signature = $signature; url = $url } }
} | ConvertTo-Json -Depth 6
$target = Join-Path $bundleDir 'latest.json'
[System.IO.File]::WriteAllText($target, $manifest, [System.Text.UTF8Encoding]::new($false))
Write-Host "Release files: $($installer.FullName), $signaturePath, $target"
