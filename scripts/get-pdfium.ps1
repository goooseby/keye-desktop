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
if ($actual -ne $expected) { throw 'PDFium 下载文件校验失败，请删除项目内 .tools/pdfium/pdfium-win-x64.tgz 后重试。' }
tar -xzf $archive -C $directory
if (-not (Test-Path -LiteralPath $env:KEYE_PDFIUM_PATH)) { throw 'PDFium 压缩包未包含预期的 bin/pdfium.dll。' }
