$ErrorActionPreference = 'Stop'
# 启动带 WebView2 调试端口的开发版（端口 9222），供 scripts/dev 下的回归脚本连接。
# 日常开发仍用 scripts/dev.ps1；本脚本只多开一个本地调试端口。
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = '--remote-debugging-port=9222'
& (Join-Path $PSScriptRoot 'dev.ps1')