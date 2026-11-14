import { isTauri } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { desktopCommand } from './desktop'

declare global {
  interface Window {
    startWorkbench: (bridge: {
      call: (command: string, data?: Record<string, unknown>) => Promise<any>
      listen: (event: string, handler: (payload: any) => void) => Promise<() => void>
    }) => Promise<void>
    prepareWorkbenchClose: () => Promise<boolean>
  }
}

if (isTauri()) {
  let closing = false
  const appWindow = getCurrentWindow()
  await appWindow.onCloseRequested(async event => {
    if (closing) return
    event.preventDefault()
    if (await window.prepareWorkbenchClose()) {
      closing = true
      await appWindow.close()
    }
  })
  await window.startWorkbench({
    call: desktopCommand,
    listen: (event, handler) => listen(event, message => handler(message.payload)),
  })
} else {
  document.querySelector('#workbench')!.textContent = '请通过华工课栈桌面程序打开真实资料库。'
}
