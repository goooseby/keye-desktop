$script:KeyeProjectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$env:RUSTUP_HOME = Join-Path $script:KeyeProjectRoot '.toolchain\rustup'
$env:CARGO_HOME = Join-Path $script:KeyeProjectRoot '.toolchain\cargo'
$env:CARGO_TARGET_DIR = Join-Path $script:KeyeProjectRoot '.build\cargo'
$env:PATH = "$(Join-Path $env:CARGO_HOME 'bin');$env:PATH"
