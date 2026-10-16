// 连接开发中的课页窗口（WebView2 调试端口），供 scripts/dev 下的回归脚本复用。
// 端口默认 9222，可用环境变量 KEYE_DEBUG_PORT 覆盖；启动方式见 scripts/inspect.ps1。
const PORT = Number(process.env.KEYE_DEBUG_PORT || 9222);

async function appPage() {
  const response = await fetch(`http://127.0.0.1:${PORT}/json/list`);
  const targets = await response.json();
  const page = targets.find(item => item.type === 'page' && (item.url || '').includes('5173'));
  if (!page) throw new Error(`没有找到课页窗口。请先用 scripts/inspect.ps1 启动开发版（调试端口 ${PORT}）。`);
  return page;
}

function session(page) {
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  let sequence = 0;
  const pending = new Map();
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    const entry = pending.get(message.id);
    if (!entry) return;
    pending.delete(message.id);
    message.error ? entry.reject(new Error(JSON.stringify(message.error))) : entry.resolve(message.result);
  };
  const send = (method, params) => new Promise((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const opened = new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = () => reject(new Error(`调试端口连接失败（${PORT}）。`));
  });
  return { socket, send, opened };
}

// 在页面里执行表达式（可含 await），返回其 JSON 结果。
export async function evaluate(expression, { timeout = 180000 } = {}) {
  const page = await appPage();
  const { socket, send, opened } = session(page);
  await opened;
  try {
    const result = await Promise.race([
      send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('页面执行超时。')), timeout).unref()),
    ]);
    if (result.exceptionDetails) throw new Error('页面内异常：' + (result.exceptionDetails.exception?.description || JSON.stringify(result.exceptionDetails)));
    const value = result.result?.value;
    return typeof value === 'string' ? JSON.parse(value) : value;
  } finally {
    socket.close();
  }
}

// 截图当前窗口（用于人工查看界面效果）。
export async function screenshot(target, { timeout = 30000 } = {}) {
  const page = await appPage();
  const { socket, send, opened } = session(page);
  await opened;
  try {
    await send('Page.enable');
    const shot = await Promise.race([
      send('Page.captureScreenshot', { format: 'png' }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('截图超时。')), timeout).unref()),
    ]);
    const { writeFileSync } = await import('node:fs');
    writeFileSync(target, Buffer.from(shot.data, 'base64'));
    return target;
  } finally {
    socket.close();
  }
}