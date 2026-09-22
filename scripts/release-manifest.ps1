$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'env.ps1')
$config = Get-Content -Raw -Encoding UTF8 (Join-Path $script:KeyeProjectRoot 'src-tauri\tauri.conf.json') | ConvertFrom-Json
$version = $config.version
$bundleDir = Join-Path $script:KeyeProjectRoot '.build\cargo\release\bundle\nsis'
$installer = Get-ChildItem -LiteralPath $bundleDir -File -Filter '*-setup.exe' |
    Where-Object { $_.Name -like "*$version*" } | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $installer) { throw "No NSIS installer found for version $version." }
$signaturePath = "$($installer.FullName).sig"
if (-not (Test-Path -LiteralPath $signaturePath)) { throw 'The installer signature is missing.' }
$signature = (Get-Content -Raw -Encoding UTF8 -LiteralPath $signaturePath).Trim()
if (-not $signature) { throw 'The installer signature is empty.' }
$url = "https://github.com/goooseby/keye-desktop/releases/download/v$version/$([uri]::EscapeDataString($installer.Name))"
$manifest = @{
    version = $version
    notes = 'See the GitHub release notes.'
    size = $installer.Length
    platforms = @{ 'windows-x86_64' = @{ signature = $signature; url = $url } }
} | ConvertTo-Json -Depth 6
$target = Join-Path $bundleDir 'latest.json'
[System.IO.File]::WriteAllText($target, $manifest, [System.Text.UTF8Encoding]::new($false))
Write-Host "Release files: $($installer.FullName), $signaturePath, $target"
