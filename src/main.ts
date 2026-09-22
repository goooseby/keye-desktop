import { invoke, isTauri } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'

declare global {
  interface Window {
    keyeInvoke: (command: string, data: Record<string, unknown>) => Promise<any>
    startKeye: () => void
    keyeListen: (event: string, handler: (payload: any) => void) => void
  }
}

window.keyeInvoke = (command, data) => invoke('request', { command, data })
window.keyeListen = (event, handler) => { void listen(event, message => handler(message.payload)) }

if (isTauri()) window.startKeye()
else document.querySelector('#main')!.innerHTML = '<div class="empty">请通过桌面程序打开课页。</div>'
