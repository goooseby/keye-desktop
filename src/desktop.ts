import { invoke } from '@tauri-apps/api/core'
import { check, type Update } from '@tauri-apps/plugin-updater'

let pendingUpdate: Update | null = null
let updateDownloaded = false
let updateCheckPromise: Promise<unknown> | null = null
let downloadingUpdate = false
const updateInfo = () => pendingUpdate ? {
  available: true, latest: pendingUpdate.version, notes: pendingUpdate.body || '',
  incremental: false, size: Number(pendingUpdate.rawJson?.size) || 0
} : { available: false }
async function checkUpdate() {
  let found: Update | null
  try { found = await check({ timeout: 20000 }) }
  catch (error) {
    if (!/\b404\b/.test(String(error))) throw error
    return { available: false, manual: true, manualReason: '尚未发布可供检查的正式版本。' }
  }
  await pendingUpdate?.close()
  pendingUpdate = found
  updateDownloaded = false
  return updateInfo()
}
async function updateCommand(command: string) {
  // The frontend build is also used in tauri dev; ask Rust for the build capability.
  if (!await invoke<boolean>('request', { command: 'updateCapability', data: {} })) {
    throw new Error('开发版不执行正式版本的自动更新，请使用安装版。')
  }
  if (command === 'checkUpdate') {
    if (downloadingUpdate || updateDownloaded) return updateInfo()
    if (!updateCheckPromise) updateCheckPromise = checkUpdate().finally(() => { updateCheckPromise = null })
    return updateCheckPromise
  }
  if (updateCheckPromise) await updateCheckPromise
  if (!pendingUpdate) throw new Error('请先检查更新。')
  if (command === 'downloadUpdate') {
    if (downloadingUpdate) throw new Error('更新正在下载，请稍候。')
    if (updateDownloaded) return true
    downloadingUpdate = true
    let received = 0
    let total = 0
    try { await pendingUpdate.download(event => {
      if (event.event === 'Started') total = event.data.contentLength || 0
      if (event.event === 'Progress') received += event.data.chunkLength
      window.dispatchEvent(new CustomEvent('keye-update-progress', { detail: total ? Math.min(100, Math.round(received * 100 / total)) : 0 }))
    }) } finally { downloadingUpdate = false }
    updateDownloaded = true
    return true
  }
  if (command === 'installUpdate') {
    if (!updateDownloaded) throw new Error('请先下载更新。')
    await pendingUpdate.install({ restartAfterInstall: true })
    return true
  }
}
export const desktopCommand = (command: string, data: Record<string, unknown> = {}) => ['checkUpdate', 'downloadUpdate', 'installUpdate'].includes(command)
  ? updateCommand(command)
  : invoke('request', { command, data })
