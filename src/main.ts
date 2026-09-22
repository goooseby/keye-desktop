import { invoke, isTauri } from '@tauri-apps/api/core'
import './style.css'

type AppStatus = {
  version: string
  platform: string
  phase: string
}

type Section = 'overview' | 'acquire' | 'library' | 'editor'

const sections: Record<Section, { title: string; lead: string; details: string[] }> = {
  overview: {
    title: '从课件到自己的资料库',
    lead: '新架构的第一步：先验证窗口、界面与 Rust 核心可以稳定通信。',
    details: ['登录与扫描', '按课程归档', '逐页筛选', '导出 PDF'],
  },
  acquire: {
    title: '获取课件',
    lead: '此页尚未接入校园平台。后续先验证网页登录态和课程扫描，再迁移下载流程。',
    details: ['网页登录', '自动扫描', '课程与课次', '后台下载'],
  },
  library: {
    title: '资料库',
    lead: '资料库将使用独立的数据目录；新项目不会自动读取或改动旧项目资料。',
    details: ['课程列表', '课次状态', '原始页面', '导出记录'],
  },
  editor: {
    title: '整理页面',
    lead: '此页将承接现有的预览、快速翻页、批量排除和恢复操作。',
    details: ['缩略图', '全屏预览', '范围选择', '快速导出'],
  },
}

const app = document.querySelector<HTMLDivElement>('#app')!
app.innerHTML = `
  <div class="shell">
    <aside class="sidebar">
      <div class="brand"><img src="/app-icon.svg" alt="" /><span>课页 <small>NEXT</small></span></div>
      <p class="sidebar-label">架构样机</p>
      <nav aria-label="主导航">
        <button class="nav-item active" data-section="overview">总览</button>
        <button class="nav-item" data-section="acquire">获取课件</button>
        <button class="nav-item" data-section="library">资料库</button>
        <button class="nav-item" data-section="editor">整理页面</button>
      </nav>
      <div class="sidebar-note">这是一套独立的新项目。<br />当前不连接学校，也不读取旧版资料。</div>
    </aside>
    <div class="workspace">
      <header class="topbar"><span>课页 <span class="slash">/</span> <span id="breadcrumb">总览</span></span><span class="prototype-pill">架构样机 · 尚无真实数据</span></header>
      <main class="content">
        <div class="eyebrow">KEYE DESKTOP · 0.1</div>
        <h1 id="section-title"></h1>
        <p class="lead" id="section-lead"></p>
        <div class="milestones" id="milestones"></div>
        <section class="status-card" aria-live="polite">
          <div><h2>桌面核心连接</h2><p>用于确认 WebView2 界面与 Rust 后端确实在同一个桌面程序中工作。</p></div>
          <div class="connection" id="connection">正在检查…</div>
        </section>
        <p class="footnote">正式功能尚未迁移。设计和迁移顺序见项目 docs 目录。</p>
      </main>
    </div>
  </div>
`

function renderSection(section: Section): void {
  const data = sections[section]
  document.querySelector<HTMLElement>('#section-title')!.textContent = data.title
  document.querySelector<HTMLElement>('#section-lead')!.textContent = data.lead
  document.querySelector<HTMLElement>('#breadcrumb')!.textContent =
    document.querySelector<HTMLButtonElement>(`[data-section="${section}"]`)!.textContent
  const milestones = document.querySelector<HTMLElement>('#milestones')!
  milestones.replaceChildren(...data.details.map((label, index) => {
    const item = document.createElement('div')
    item.className = 'milestone'
    const number = document.createElement('span')
    number.className = 'milestone-index'
    number.textContent = String(index + 1).padStart(2, '0')
    const text = document.createElement('strong')
    text.textContent = label
    item.append(number, text)
    return item
  }))
  document.querySelectorAll<HTMLButtonElement>('.nav-item').forEach((button) => {
    button.classList.toggle('active', button.dataset.section === section)
  })
}

document.querySelectorAll<HTMLButtonElement>('.nav-item').forEach((button) => {
  button.addEventListener('click', () => renderSection(button.dataset.section as Section))
})

renderSection('overview')

const connection = document.querySelector<HTMLElement>('#connection')!
if (isTauri()) {
  invoke<AppStatus>('app_status')
    .then((status) => { connection.textContent = `已连接 · Rust ${status.version}` })
    .catch((error: unknown) => { connection.textContent = `连接失败：${String(error)}` })
} else {
  connection.textContent = '浏览器预览 · 请启动桌面程序验证'
}
