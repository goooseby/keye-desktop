$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'env.ps1')
if (Test-Path -LiteralPath $env:KEYE_PDFIUM_PATH) { return }

$directory = Join-Path $script:KeyeProjectRoot '.tools\pdfium'
$archive = Join-Path $directory 'pdfium-win-x64.tgz'
$expected = '45C4CC5D052EF8EC6380B946B548A76100F4675E38362000A4C732E16D5E8EDA'
New-Item -ItemType Directory -Force -Path $directory | Out-Null
if (-not (Test-Path -LiteralPath $archive)) {
    $url = 'https://github.com/bblanchon/pdfium-binaries/releases/download/chromium/7763/pdfium-win-x64.tgz'
    Invoke-WebRequest -Uri $url -OutFile $archive
}
$actual = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash
if ($actual -ne $expected) { throw 'PDFium archive checksum mismatch. Remove .tools/pdfium/pdfium-win-x64.tgz from this project and retry.' }
tar -xzf $archive -C $directory
if (-not (Test-Path -LiteralPath $env:KEYE_PDFIUM_PATH)) { throw 'The PDFium archive does not contain bin/pdfium.dll.' }
