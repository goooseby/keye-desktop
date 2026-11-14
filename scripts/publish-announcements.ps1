param(
    [string]$Source = 'announcements/desktop.json',
    [string]$HostName = '8.138.204.47',
    [string]$UserName = 'root'
)
$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$sourcePath = (Resolve-Path -LiteralPath (Join-Path $projectRoot $Source)).Path
$feed = Get-Content -Raw -Encoding UTF8 -LiteralPath $sourcePath | ConvertFrom-Json
if ($feed.schemaVersion -ne 1 -or $null -eq $feed.announcements -or $feed.announcements.Count -gt 50) { throw '公告格式无效。' }
if ((Get-Item -LiteralPath $sourcePath).Length -gt 262144) { throw '公告文件超过 256 KiB。' }
$ids = @{}
foreach ($item in $feed.announcements) {
    if ($item.id -notmatch '^[A-Za-z0-9_-]{1,80}$' -or $ids.ContainsKey($item.id) -or ($null -ne $item.revision -and $item.revision -lt 1)) { throw '公告编号或修订号无效。' }
    $ids[$item.id] = $true
    if ([string]::IsNullOrWhiteSpace($item.title) -or $item.title.Length -gt 100 -or [string]::IsNullOrWhiteSpace($item.body) -or $item.body.Length -gt 12000) { throw '公告标题或正文无效。' }
    $published = [DateTimeOffset]::Parse($item.publishedAt)
    if ($item.expiresAt -and [DateTimeOffset]::Parse($item.expiresAt) -le $published) { throw '公告有效期无效。' }
    if ($item.kind -and $item.kind -notin @('general','update')) { throw '公告类型无效。' }
    if ($item.kind -eq 'update' -and -not $item.version) { throw '更新公告缺少版本号。' }
    foreach ($value in @($item.version,$item.minVersion,$item.maxVersion)) { if ($value -and $value -notmatch '^\d+\.\d+\.\d+$') { throw '版本应使用 x.y.z 格式。' } }
    if ($item.minVersion -and $item.maxVersion -and [version]$item.minVersion -gt [version]$item.maxVersion) { throw '版本范围无效。' }
}
if ($HostName -notmatch '^[a-zA-Z0-9.-]+$' -or $UserName -notmatch '^[a-zA-Z0-9_-]+$') { throw 'SSH 目标无效。' }
$target = "$UserName@$HostName"
$temporary = '/var/www/keye/desktop/.announcements-' + [guid]::NewGuid().ToString('N') + '.json'
ssh -o BatchMode=yes $target 'mkdir -p /var/www/keye/desktop'
if ($LASTEXITCODE -ne 0) { throw '无法连接公告服务器。' }
scp -q $sourcePath "${target}:$temporary"
if ($LASTEXITCODE -ne 0) { throw '上传公告失败。' }
# The destination is fixed; replacement is atomic and the Android feed is untouched.
ssh -o BatchMode=yes $target "python3 -m json.tool '$temporary' > /dev/null && chmod 644 '$temporary' && mv '$temporary' /var/www/keye/desktop/announcements.json"
if ($LASTEXITCODE -ne 0) { throw '服务器校验或原子替换失败。' }
$response = Invoke-WebRequest 'https://keye.kovra.top/desktop/announcements.json' -Headers @{ 'Cache-Control' = 'no-cache' } -TimeoutSec 15
$remoteHash = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($response.Content)))
$localHash = (Get-FileHash -LiteralPath $sourcePath -Algorithm SHA256).Hash
if ($remoteHash -ne $localHash) { throw '线上公告与本地文件不一致。' }
Write-Host "公告已更新：$($feed.announcements.Count) 条，https://keye.kovra.top/desktop/announcements.json"
