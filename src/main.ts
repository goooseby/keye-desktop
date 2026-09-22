import { invoke, isTauri } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { check, type Update } from '@tauri-apps/plugin-updater'

declare global {
  interface Window {
    keyeInvoke: (command: string, data: Record<string, unknown>) => Promise<any>
    startKeye: () => void
    keyeListen: (event: string, handler: (payload: any) => void) => void
  }
}

let pendingUpdate: Update | null = null
let updateDownloaded = false
async function updateCommand(command: string) {
  if (command === 'checkUpdate') {
    await pendingUpdate?.close()
    try {
      pendingUpdate = await check({ timeout: 20000 })
    } catch (error) {
      if (/\b404\b/.test(String(error))) return { available: false, manual: true, manualReason: '尚未发布可供检查的正式版本。' }
      throw error
    }
    updateDownloaded = false
    return pendingUpdate ? {
      available: true, latest: pendingUpdate.version, notes: pendingUpdate.body || '',
      incremental: false, size: Number(pendingUpdate.rawJson?.size) || 0
    } : { available: false }
  }
  if (!pendingUpdate) throw new Error('请先检查更新。')
  if (command === 'downloadUpdate') {
    let received = 0
    let total = 0
    await pendingUpdate.download(event => {
      if (event.event === 'Started') total = event.data.contentLength || 0
      if (event.event === 'Progress') received += event.data.chunkLength
      window.dispatchEvent(new CustomEvent('keye-update-progress', { detail: total ? Math.min(100, Math.round(received * 100 / total)) : 0 }))
    })
    updateDownloaded = true
    return true
  }
  if (command === 'installUpdate') {
    if (!updateDownloaded) throw new Error('请先下载更新。')
    await pendingUpdate.install({ restartAfterInstall: true })
    return true
  }
}
window.keyeInvoke = (command, data) => ['checkUpdate', 'downloadUpdate', 'installUpdate'].includes(command)
  ? updateCommand(command)
  : invoke('request', { command, data })
window.keyeListen = (event, handler) => { void listen(event, message => handler(message.payload)) }

if (isTauri()) {
  document.body.classList.add('desktop-window')
  const appWindow = getCurrentWindow()
  document.querySelector('#window-minimize')?.addEventListener('click', () => { void appWindow.minimize() })
  document.querySelector('#window-maximize')?.addEventListener('click', () => { void appWindow.toggleMaximize() })
  document.querySelector('#window-close')?.addEventListener('click', () => { void appWindow.close() })
  window.startKeye()
}
else document.querySelector('#main')!.innerHTML = '<div class="empty">请通过桌面程序打开课页。</div>'
