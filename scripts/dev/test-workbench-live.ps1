param([switch]$BulletinsOnly)
$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..')).Path
Set-Location -LiteralPath $projectRoot
. (Join-Path $PSScriptRoot '../env.ps1')
# A distinct WebView profile avoids sharing the normal development debugger.
$qaRoot = (python (Join-Path $PSScriptRoot 'workbench-fixture.py')).Trim()
if ($LASTEXITCODE -ne 0) { throw '无法创建隔离测试资料库。' }
if ((Split-Path -Parent $qaRoot) -ne (Join-Path $projectRoot '.build')) { throw '测试目录越出 .build。' }
$env:KEYE_DEV_DATA_DIR = $qaRoot
$env:WEBVIEW2_USER_DATA_FOLDER = Join-Path $qaRoot 'webview'
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = '--remote-debugging-port=9223'
try { Invoke-RestMethod 'http://127.0.0.1:9223/json/list' -TimeoutSec 1 | Out-Null; throw '端口 9223 已有调试实例，请先结束该测试实例。' }
catch { if ($_.Exception.Message -like '*已有调试实例*') { throw } }
$qaProcess = Start-Process -FilePath (Join-Path $projectRoot '.build/cargo/debug/keye-desktop.exe') -WindowStyle Hidden -PassThru
try {
  New-Item -ItemType Directory -Force -Path '.build/workbench-review' | Out-Null
  @{root=$qaRoot;pid=$qaProcess.Id} | ConvertTo-Json | Set-Content '.build/workbench-review/qa-process.json'
  $connected = $false
  for ($attempt=0; $attempt -lt 40; $attempt++) {
    try { Invoke-RestMethod 'http://127.0.0.1:9223/json/list' -TimeoutSec 1 | Out-Null; $connected=$true; break } catch { Start-Sleep -Milliseconds 250 }
  }
  if (-not $connected) { throw '隔离测试窗口未能启动。' }
  if ($BulletinsOnly) {
    node (Join-Path $PSScriptRoot 'workbench-bulletins.test.mjs')
    if ($LASTEXITCODE -ne 0) { throw '公告与更新检查失败。' }
    return
  }
  node (Join-Path $PSScriptRoot 'workbench-live.test.mjs')
  if ($LASTEXITCODE -ne 0) { throw '真实业务界面检查失败。' }
  node (Join-Path $PSScriptRoot 'workbench-polish.test.mjs')
  if ($LASTEXITCODE -ne 0) { throw '课程分组、设置和预览检查失败。' }
  node (Join-Path $PSScriptRoot 'workbench-bulletins.test.mjs')
  if ($LASTEXITCODE -ne 0) { throw '公告与更新检查失败。' }
  node (Join-Path $PSScriptRoot 'workbench-course.test.mjs')
  if ($LASTEXITCODE -ne 0) { throw '课程管理检查失败。' }
  Stop-Process -Id $qaProcess.Id
  for ($attempt=0; $attempt -lt 30; $attempt++) {
    try { Invoke-RestMethod 'http://127.0.0.1:9223/json/list' -TimeoutSec 1 | Out-Null; Start-Sleep -Milliseconds 100 } catch { break }
  }
  $qaProcess = Start-Process -FilePath (Join-Path $projectRoot '.build/cargo/debug/keye-desktop.exe') -WindowStyle Hidden -PassThru
  @{root=$qaRoot;pid=$qaProcess.Id} | ConvertTo-Json | Set-Content '.build/workbench-review/qa-process.json'
  for ($attempt=0; $attempt -lt 40; $attempt++) {
    try { if ((Invoke-RestMethod 'http://127.0.0.1:9223/json/list' -TimeoutSec 1).Length -gt 0) { break } } catch { }
    Start-Sleep -Milliseconds 250
  }
  node (Join-Path $PSScriptRoot 'workbench-course.test.mjs') --resume
  if ($LASTEXITCODE -ne 0) { throw '课程删除计划重启恢复检查失败。' }
} finally {
  if (Get-Process -Id $qaProcess.Id -ErrorAction SilentlyContinue) { Stop-Process -Id $qaProcess.Id }
}
