$script:KeyeProjectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$env:RUSTUP_HOME = Join-Path $script:KeyeProjectRoot '.toolchain\rustup'
$env:CARGO_HOME = Join-Path $script:KeyeProjectRoot '.toolchain\cargo'
$env:CARGO_TARGET_DIR = Join-Path $script:KeyeProjectRoot '.build\cargo'
$env:KEYE_DEV_DATA_DIR = Join-Path $script:KeyeProjectRoot '.build\dev-data'
$env:KEYE_PDFIUM_PATH = Join-Path $script:KeyeProjectRoot '.tools\pdfium\bin\pdfium.dll'
$env:PATH = "$(Join-Path $env:CARGO_HOME 'bin');$env:PATH"
