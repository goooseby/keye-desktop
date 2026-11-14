'use strict';

// New standalone workbench. Business actions use disposable, in-memory sample data.
const glyphs = {
  menu: 'M4 6h16 M4 12h16 M4 18h16',
  bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9 M10 21h4',
  keye: 'M5 3h11l3 3v15H5z M8 8h8 M8 12h8 M8 16h5 M16 3v4h3',
  files: 'M7 3h10l3 3v14H7z M4 7v15h12 M16 3v5h4',
  file: 'M5 3h10l4 4v14H5z M14 3v5h5 M8 12h8 M8 16h6',
  folder: 'M3 6V4h6l2 3h10v13H3z',
  search: 'M20 20l-5-5 M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0',
  clock: 'M12 7v6l4 2 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
  check: 'm5 12 4 4L19 6',
  circleCheck: 'm8 12 3 3 5-6 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
  download: 'M12 3v12 m-4-4 4 4 4-4 M4 16v5h16v-5',
  upload: 'M12 16V3 m-4 4 4-4 4 4 M4 17v4h16v-4',
  export: 'M14 3h7v7 M21 3 11 13 M10 5H4v15h15v-6',
  tasks: 'M8 5h13 M8 12h13 M8 19h13 M3 5h.01 M3 12h.01 M3 19h.01',
  settings: 'M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1z M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  trash: 'M3 6h18 M9 6V3h6v3 M5 6l1 15h12l1-15 M10 10v7 M14 10v7',
  help: 'M9 8a3 3 0 0 1 6 0c0 2-3 2-3 5 M12 17h.01 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
  panel: 'M3 4h18v16H3z M9 4v16',
  details: 'M3 4h18v16H3z M15 4v16',
  plus: 'M12 5v14 M5 12h14',
  minus: 'M5 12h14',
  close: 'm6 6 12 12 M18 6 6 18',
  maximize: 'M5 5h14v14H5z',
  left: 'm14 6-6 6 6 6',
  right: 'm10 6 6 6-6 6',
  down: 'm7 10 5 5 5-5',
  arrow: 'M4 12h16 m-5-5 5 5-5 5',
  more: 'M5 12h.01 M12 12h.01 M19 12h.01',
  grid: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  list: 'M8 5h13 M8 12h13 M8 19h13 M3 5h1 M3 12h1 M3 19h1',
  crop: 'M6 3v15h15 M3 6h15v15',
  undo: 'M4 4v6h6 M4 10a8 8 0 1 1 0 7',
  fit: 'M3 9V3h6 M15 3h6v6 M21 15v6h-6 M9 21H3v-6',
  lock: 'M5 10h14v11H5z M8 10V6a4 4 0 0 1 8 0v4',
  pause: 'M8 5v14 M16 5v14',
  alert: 'M12 3 2 21h20z M12 9v5 M12 18h.01',
  info: 'M12 11v6 M12 7h.01 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
  play: 'm8 4 12 8-12 8z',
  refresh: 'M20 4v6h-6 M20 10a8 8 0 1 0 0 7',
  school: 'm3 9 9-6 9 6 M5 10h14 M6 10v9 M12 10v9 M18 10v9 M3 21h18',
  range: 'M4 6h16v12H4z M8 10v4 M12 10v4 M16 10v4',
};
const icon = name => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${glyphs[name] || glyphs.file}"/></svg>`;
const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
const button = (label, action, symbol = '', style = '', attributes = '') => `<button class="${style}" data-action="${action}" ${attributes}>${symbol ? icon(symbol) : ''}${label}</button>`;
const iconButton = (symbol, label, action, on = false) => button('', action, symbol, `icon-button ${on ? 'on' : ''}`, `title="${label}" aria-label="${label}"`);
const courses = [
  { id: 'ml', name: '机器学习', color: '#2356bc', dark: '#152e60', short: 'MACHINE LEARNING' },
  { id: 'math', name: '数学建模与优化', color: '#7256b8', dark: '#382865', short: 'MATHEMATICAL MODELING' },
  { id: 'network', name: '计算机网络', color: '#007e9c', dark: '#123f57', short: 'COMPUTER NETWORKS' },
  { id: 'design', name: '项目管理与沟通', color: '#c26829', dark: '#6e3c24', short: 'PROJECT MANAGEMENT' },
];
const files = [
  { id:'ml9', course:'ml', title:'第 09 讲 · 神经网络基础', date:'2026-11-12', pages:36, review:'reviewing', exported:false },
  { id:'math6', course:'math', title:'第 06 讲 · 非线性优化', date:'2026-11-11', pages:32, review:'pending', exported:false },
  { id:'net8', course:'network', title:'第 08 讲 · 网络层与路由', date:'2026-11-10', pages:40, review:'pending', exported:false },
  { id:'design5', course:'design', title:'第 05 讲 · 项目计划与进度', date:'2026-11-09', pages:28, review:'done', exported:true },
  { id:'ml8', course:'ml', title:'第 08 讲 · 支持向量机', date:'2026-11-05', pages:38, review:'pending', exported:false },
  { id:'math5', course:'math', title:'第 05 讲 · 线性规划', date:'2026-11-04', pages:34, review:'done', exported:true },
  { id:'net7', course:'network', title:'第 07 讲 · 数据链路层', date:'2026-11-03', pages:42, review:'done', exported:false },
  { id:'design4', course:'design', title:'第 04 讲 · 需求分析与范围', date:'2026-11-02', pages:26, review:'done', exported:true },
  { id:'ml7', course:'ml', title:'第 07 讲 · 集成学习', date:'2026-10-29', pages:46, review:'done', exported:true },
  { id:'math4', course:'math', title:'第 04 讲 · 约束与可行域', date:'2026-10-28', pages:30, review:'done', exported:true },
  { id:'ml6', course:'ml', title:'第 06 讲 · 决策树', date:'2026-10-22', pages:34, review:'done', exported:true },
  { id:'net6', course:'network', title:'第 06 讲 · 传输介质', date:'2026-10-20', pages:38, review:'done', exported:true },
];
files.forEach(file => Object.assign(file, { excluded:new Set(file.id==='ml9' ? [7, 18] : []), crops:new Map(), history:[], lastPage:file.id==='ml9' ? 3 : 1, deleted:false }));
const ui = { page:'library', scope:'all', filter:'all', query:'', sort:'recent', view:'list', compact:false, details:false, focused:null, selected:new Set(), openFile:'ml9', current:3, zoom:100, crop:null, onlyKept:false, connected:false, scanned:false, scanning:false, scanRange:null, scanStart:'2026-11-01', scanEnd:'2026-11-13', downloadAfter:'store', workers:'2', scanSelected:new Set(), tasksFilter:'all', tasks:[], scanAdded:new Set(), autoSave:true, updateCheck:true, exportDir:'D:\\华工课栈导出', recent:['ml9','math5','net7'] };
if(WorkbenchBusiness.enabled){
  courses.length=0;files.length=0;ui.openFile=null;ui.current=1;ui.recent=[];ui.exportDir='';
  const day=new Date(),start=new Date();start.setDate(day.getDate()-6);
  const date=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  ui.scanStart=date(start);ui.scanEnd=date(day);
}
const root = document.querySelector('#workbench');
Object.assign(ui,{scanExpanded:new Set(),scanDirectExport:ui.downloadAfter==='export',downloadDraft:{},downloadOptionsOpen:false,dateFrom:'',dateTo:''});
const dialog = document.querySelector('#dialog');
const currentFile = () => files.find(file => file.id === ui.openFile) || files[0];
const courseOf = file => courses.find(course => course.id === file.course) || courses[0];
const reviewLabel = file => ({pending:'待整理', reviewing:'整理中', done:'已整理'})[file.review];
const stateBadge = (label,tone='neutral',symbol='') => `<span class="status ${tone}">${symbol?icon(symbol):'<i class="status-dot"></i>'}${escapeHtml(label)}</span>`;
const status = file => `<span class="status ${file.review}">${file.review==='done' ? icon('check') : file.review==='reviewing' ? icon('clock') : '<i class="status-dot"></i>'}${reviewLabel(file)}</span>`;
let noticeTimer;
let canvasObserver;
const libraryScroll = new Map();
const libraryKey = () => JSON.stringify([ui.scope,ui.filter,ui.query,ui.sort,ui.view,ui.dateFrom,ui.dateTo]);
function captureLibraryScroll() {
  const list=document.querySelector('.table-scroll[data-scroll-key]');
  if(list)libraryScroll.set(list.dataset.scrollKey,list.scrollTop);
}
function notify(message,tone='info') {
  const target = document.querySelector('#notification');
  target.className='notification '+tone;
  target.innerHTML=icon(tone==='success'?'circleCheck':tone==='warning'?'alert':'info')+`<span>${escapeHtml(message)}</span>`;
  if(typeof target.showPopover==='function'&&!target.matches(':popover-open'))target.showPopover();
  target.classList.add('visible');
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => {target.classList.remove('visible');if(typeof target.hidePopover==='function'&&target.matches(':popover-open'))target.hidePopover();},2900);
}

// Slide artwork is document content. Its own palette is independent of the app shell.
function slideSvg(file, page, useCrop = true, thumb = false) {
  if(WorkbenchBusiness.enabled)return WorkbenchBusiness.artwork(file,page,useCrop,thumb);
  const course = courseOf(file), c = course.color, dark = course.dark;
  const names = file.course==='ml'
    ? ['神经网络基础','一个神经元，如何做出预测？','从输入到输出','激活函数','损失与优化','反向传播','课堂讨论','训练与验证']
    : file.course==='math' ? ['非线性优化','问题的数学表达','目标、约束与可行域','梯度与方向','迭代求解','模型的解释','案例分析','小结']
    : file.course==='network' ? ['网络层与路由','信息如何抵达目的地？','分组的传递过程','地址与子网','路由选择','网络拓扑','课堂讨论','协议的协作']
    : ['项目计划与进度','从目标到可执行计划','项目的三个阶段','任务分解','资源与约束','进度管理','团队讨论','复盘与改进'];
  names[0]=file.title.replace(/^第\s*\d+\s*讲\s*·\s*/, '');
  const title = names[(page-1)%names.length];
  const rect = useCrop && file.crops.get(page);
  const viewBox = rect ? `${rect.x*960} ${rect.y*540} ${rect.w*960} ${rect.h*540}` : '0 0 960 540';
  const ratio = rect ? (rect.w*960)/(rect.h*540) : 16/9;
  let art;
  if ((page-1)%8 === 0) {
    art = `<rect width="960" height="540" fill="${dark}"/><path d="M680 0 960 220V0z" fill="${c}"/><circle cx="920" cy="530" r="220" fill="none" stroke="#ffffff" stroke-opacity=".12" stroke-width="55"/><text x="66" y="80" fill="#ffffff" opacity=".75" font-size="15" letter-spacing="3">${course.short}</text><rect x="66" y="184" width="44" height="5" fill="#f7bf57"/><text x="64" y="272" fill="#fff" font-size="52" font-weight="650">${title}</text><text x="68" y="320" fill="#fff" opacity=".8" font-size="20">2026 秋季学期　/　课堂课件</text><text x="68" y="475" fill="#fff" opacity=".7" font-size="14">${escapeHtml(course.name)} · 第 ${String(page).padStart(2,'0')} 页</text>`;
  } else {
    const header = `<rect width="960" height="540" fill="#fff"/><rect x="0" y="0" width="960" height="8" fill="${c}"/><text x="55" y="56" fill="${c}" font-size="13" font-weight="600" letter-spacing="2">${course.short}</text><text x="55" y="118" fill="#202f45" font-size="34" font-weight="600">${title}</text><text x="56" y="154" fill="#53647d" font-size="17">${page%3===0 ? '将复杂过程拆分为清晰的步骤，理解每一层的作用。' : '理解基本结构，再观察参数如何影响最终的结果。'}</text>`;
    const footer = `<line x1="55" x2="905" y1="487" y2="487" stroke="#dbe2ed"/><text x="55" y="515" fill="#5d6e86" font-size="12">${escapeHtml(course.name)}　·　2026 秋季学期</text><text x="900" y="515" text-anchor="end" fill="#5d6e86" font-size="12">${String(page).padStart(2,'0')}</text>`;
    let body;
    if (page%3===0) {
      const labels = file.course==='ml' ? ['输入层','隐藏层','输出层'] : file.course==='network' ? ['源节点','中间路由','目的节点'] : ['定义问题','建立模型','验证结果'];
      body = [0,1,2].map((n)=>{
        const x=74+n*295, colors=['#2356bc','#7853b1','#c57a28'];
        return `<rect x="${x}" y="222" width="225" height="170" rx="9" fill="${['#edf3ff','#f3effa','#fff5e9'][n]}" stroke="${colors[n]}" stroke-opacity=".3"/><circle cx="${x+112}" cy="271" r="25" fill="${colors[n]}"/><text x="${x+112}" y="279" text-anchor="middle" fill="#fff" font-size="22">${['x','Σ','y'][n]}</text><text x="${x+112}" y="339" text-anchor="middle" font-size="23" font-weight="600" fill="#25364e">${labels[n]}</text><text x="${x+112}" y="371" text-anchor="middle" font-size="13" fill="#5d6e87">${['INPUT','PROCESS','OUTPUT'][n]}</text>${n<2?`<path d="M${x+243} 307h31 m-8-7 8 7-8 7" fill="none" stroke="#7c8ba0" stroke-width="2"/>`:''}`;
      }).join('');
      body += `<rect x="74" y="419" width="815" height="35" rx="5" fill="#f4f7fb"/><text x="481" y="442" text-anchor="middle" fill="#4d617e" font-size="15">每一个阶段都接收输入，完成变换，再传递结果。</text>`;
    } else if (page%3===1) {
      body = `<line x1="110" x2="110" y1="210" y2="422" stroke="#8494aa" stroke-width="2"/><line x1="110" x2="833" y1="422" y2="422" stroke="#8494aa" stroke-width="2"/>${[75,122,105,160,187,172,200].map((h,i)=>`<rect x="${160+i*88}" y="${422-h}" width="47" height="${h}" rx="4" fill="${i===4?'#e5a139':c}" opacity="${i===4?1:.65+i*.04}"/><text x="${184+i*88}" y="448" text-anchor="middle" fill="#566c8b" font-size="14">${i+1}</text>`).join('')}<text x="112" y="193" fill="#50637f" font-size="14">模型表现</text>`;
    } else {
      body = `<rect x="72" y="207" width="813" height="150" rx="9" fill="#f1f5fc"/><text x="480" y="300" text-anchor="middle" fill="${dark}" font-family="Georgia,serif" font-size="48">y = σ ( W · x + b )</text><circle cx="89" cy="403" r="5" fill="${c}"/><text x="110" y="410" fill="#425775" font-size="19">参数决定变换的方式，学习决定参数的取值。</text><circle cx="89" cy="443" r="5" fill="#d59536"/><text x="110" y="450" fill="#425775" font-size="19">先观察，再比较，最后验证。</text>`;
    }
    art=header+body+footer;
  }
  return `<svg class="slide-art" xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" role="img" aria-label="${escapeHtml(title)}，第 ${page} 页" style="aspect-ratio:${ratio};font-family:'Microsoft YaHei','Segoe UI',sans-serif;overflow:hidden">${art}</svg>`;
}

function visibleFiles() {
  let items=files.filter(file=>ui.scope==='trash' ? file.deleted : !file.deleted);
  if(courses.some(course=>course.id===ui.scope))items=items.filter(file=>file.course===ui.scope);
  if(ui.scope==='recent')items=items.filter(file=>ui.recent.includes(file.id));
  if(ui.filter==='pending')items=items.filter(file=>file.review!=='done');
  if(ui.filter==='done')items=items.filter(file=>file.review==='done');
  if(ui.dateFrom)items=items.filter(file=>file.date>=ui.dateFrom);
  if(ui.dateTo)items=items.filter(file=>file.date<=ui.dateTo);
  if(ui.query)items=items.filter(file=>`${file.title} ${courseOf(file).name} ${file.date}`.toLowerCase().includes(ui.query.toLowerCase()));
  return items.sort((a,b)=>ui.sort==='name'?a.title.localeCompare(b.title,'zh'):ui.scope==='recent'?ui.recent.indexOf(a.id)-ui.recent.indexOf(b.id):b.date.localeCompare(a.date));
}
function scopeName() { return courses.find(course=>course.id===ui.scope)?.name || ({all:'全部课件',recent:'最近打开',trash:'回收站'})[ui.scope] || '全部课件'; }
function navigate(page, scope) {
  if(WorkbenchBusiness.enabled&&!WorkbenchBusiness.canLeave())return;
  if(page==='editor')return openFile(ui.openFile);
  if(scope&&scope!==ui.scope){ui.scope=scope;ui.filter='all';ui.query='';ui.focused=null;ui.details=false;ui.selected.clear();ui.dateFrom='';ui.dateTo='';}
  WorkspaceTabs.open(page);
}
function openFile(id,{review=false}={}) {
  const file=files.find(file=>file.id===id);if(!file||file.deleted)return;
  WorkspaceTabs.open('editor',id,{preserveReview:review});
}
function workspaceTabs() {
  return WorkspaceTabs.markup();
}
function renderShell() {
  hideAppMenu(false);
  WorkspaceTabs.hideList();
  const count=files.filter(file=>!file.deleted).length;
  const running=ui.tasks.filter(task=>['running','paused'].includes(task.status)).length;
  const native=!!window.__TAURI_INTERNALS__;
  root.innerHTML=`<div class="app ${ui.compact?'compact-nav':''}">
    <header class="windowbar">
      <div class="window-menu-group"><button id="app-menu-trigger" class="app-menu-button" data-action="app-menu" aria-haspopup="menu" aria-expanded="false" aria-controls="app-menu" title="华工课栈菜单：文件、编辑、视图和帮助">${icon('keye')}<span class="app-name">华工课栈</span><span class="app-chevron">${icon('down')}</span></button></div>
      <span class="window-context">本地工作空间</span>
      <div class="titlebar-drag" aria-hidden="true"></div>
      <div class="titlebar-tools">${WorkbenchBulletins.badge()}${iconButton('search','搜索与跳转 · Ctrl+K','command')}</div>
      ${native?`<div class="window-controls">${iconButton('minus','最小化','window-minimize')}${iconButton('maximize','最大化或还原','window-maximize')}${iconButton('close','关闭','window-close')}</div>`:''}
    </header>
    <div class="app-body"><aside class="navigation">
      <div class="nav-heading">${icon('folder')}<strong>资料导航</strong>${iconButton('panel','展开或收起目录','navigation')}</div>
      <nav aria-label="资料导航"><button class="nav-item ${ui.page==='library'&&ui.scope==='all'?'active':''}" data-scope="all" title="全部课件">${icon('files')}<span>全部课件</span><small>${count}</small></button><button class="nav-item ${ui.page==='library'&&ui.scope==='recent'?'active':''}" data-scope="recent" title="最近打开">${icon('clock')}<span>最近打开</span></button></nav>
      <div class="nav-section"><div class="nav-label">${WorkbenchBusiness.enabled?'课程':'2026 秋季学期'} ${iconButton('plus','新建课程','new-course')}</div>${courses.filter(course=>!course.pending).map(course=>`<div class="course-nav-row"><button class="nav-item course-link ${(ui.page==='library'&&ui.scope===course.id)||(ui.page==='editor'&&currentFile().course===course.id)?'active':''}" data-scope="${course.id}" style="--course-ink:${course.color}" title="${escapeHtml(course.name)}">${icon('folder')}<span>${escapeHtml(course.name)}</span><small>${files.filter(file=>file.course===course.id&&!file.deleted).length}</small></button>${course.id!=='unfiled'?button('','manage-course','more','icon-button course-more',`data-course-id="${escapeHtml(course.id)}" title="管理 ${escapeHtml(course.name)}" aria-label="管理课程 ${escapeHtml(course.name)}"`):''}</div>`).join('')}</div>
      <div class="nav-bottom"><button class="nav-item ${ui.page==='acquire'?'active':''}" data-page="acquire" title="获取课件">${icon('download')}<span>获取课件</span></button><button class="nav-item ${ui.page==='tasks'?'active':''}" data-page="tasks" title="任务">${icon('tasks')}<span>任务</span>${running?`<small>${running}</small>`:''}</button><button class="nav-item ${ui.scope==='trash'&&ui.page==='library'?'active':''}" data-scope="trash" title="回收站">${icon('trash')}<span>回收站</span></button><button class="nav-item ${ui.page==='settings'?'active':''}" data-page="settings" title="设置">${icon('settings')}<span>设置</span></button><div class="storage">${icon('lock')}<span>本地资料库</span><span class="spacer"></span>${iconButton('help','原型说明','help')}</div></div>
    </aside><main class="workspace">
      <div class="workspace-tabbar"><div class="document-tabs" role="tablist" aria-label="工作区">${workspaceTabs()}</div><div class="document-tools">${button('','tab-list','down','icon-button',`title="打开的标签页 · ${WorkspaceTabs.count}" aria-label="打开的标签页" aria-haspopup="menu" aria-expanded="false" aria-controls="tab-menu"`)}${ui.page==='editor'?iconButton('fit','放大当前页','fullscreen'):ui.page==='library'?iconButton('details','显示或隐藏详情','details',ui.details):''}</div></div>
      ${CourseManagement.banner()}<div class="page" id="page"></div></main></div>
    <footer class="app-status">${icon('lock')}<span>${ui.page==='editor'?'更改已保存在本次预览':'本地工作空间'}</span><i class="separator"></i><span>${ui.page==='editor'?`第 ${ui.current} 页 · 保留 ${currentFile().pages-currentFile().excluded.size} / ${currentFile().pages} 页`:`${count} 份课件 · ${courses.length} 门课程`}</span><span class="spacer"></span><span class="optional">${ui.page==='editor'?'<kbd>←</kbd> <kbd>→</kbd> 翻页　<kbd>E</kbd> 排除 / 恢复':'<kbd>Ctrl K</kbd> 搜索与跳转'}</span><i class="separator"></i><span>示例数据</span></footer>
  </div>`;
  if(WorkbenchBusiness.enabled){
    const spans=document.querySelectorAll('.app-status > span');spans[0].textContent=ui.page==='editor'?(WorkbenchBusiness.busy?'正在保存…':'更改已保存'):'本地工作空间';spans[spans.length-1].textContent='v'+WorkbenchBusiness.snapshot.appVersion;
  }
  CourseManagement.syncTimer();
  document.querySelector('.document-tab-slot.active')?.scrollIntoView({block:'nearest',inline:'nearest'});
}
function showAppMenu() {
  const menu=document.querySelector('#app-menu'),trigger=document.querySelector('#app-menu-trigger');
  if(menu.matches(':popover-open')){hideAppMenu(true);return;}
  const item=(label,action,symbol,disabled=false,shortcut='')=>button(label+`<span class="spacer"></span>${shortcut?`<kbd>${shortcut}</kbd>`:''}`,action,symbol,'',`role="menuitem" tabindex="-1" ${disabled?'disabled':''}`);
  menu.innerHTML=`<div class="menu-label" role="presentation">文件</div>
    ${item('新建课程','new-course','plus')}${item('导入本地文件','import','upload')}${item('获取课件','acquire','download')}${item('导出当前课件','export-current','export',ui.page!=='editor'||!currentFile()||currentFile().deleted||currentFile().excluded.size===currentFile().pages)}
    <div class="menu-divider" role="separator"></div><div class="menu-label" role="presentation">编辑与视图</div>
    ${item('搜索与跳转','command','search',false,'Ctrl K')}${item('撤销页面操作','dialog-undo','undo',ui.page!=='editor'||!currentFile().history.length,'Ctrl Z')}
    ${item(ui.compact?'展开课程目录':'收起课程目录','navigation','panel')}${item(ui.page==='editor'?'放大当前页':'显示 / 隐藏详情','details',ui.page==='editor'?'fit':'details')}
    ${item('资料库列表视图','dialog-list','list')}${item('资料库预览视图','dialog-grid','grid')}
    <div class="menu-divider" role="separator"></div>${item('使用说明与关于','help','help')}`;
  const rect=trigger.getBoundingClientRect();
  menu.style.left=Math.max(8,Math.min(innerWidth-252,rect.left))+'px';menu.style.top=rect.bottom+5+'px';
  menu.showPopover();trigger.setAttribute('aria-expanded','true');
  requestAnimationFrame(()=>{if(menu.matches(':popover-open'))menu.querySelector('[role="menuitem"]:not(:disabled)')?.focus();});
}
function hideAppMenu(restoreFocus=false) {
  const menu=document.querySelector('#app-menu');
  if(menu?.matches(':popover-open'))menu.hidePopover();
  const trigger=document.querySelector('#app-menu-trigger');trigger?.setAttribute('aria-expanded','false');
  if(restoreFocus)trigger?.focus({preventScroll:true});
}
function restoreLibraryFile(id) {
  const file=files.find(file=>file.id===id);if(!file||!file.deleted)return;
  file.deleted=false;ui.selected.delete(id);render();notify('课件已恢复。','success');
}
function render() {
  WorkbenchMotion.beforeRender();
  if(document.querySelector('#page')?.dataset.workspaceTab===WorkspaceTabs.activeId)WorkspaceTabs.capture();
  captureLibraryScroll();
  captureReviewScroll();
  canvasObserver?.disconnect();
  renderShell();
  ({library:renderLibrary,editor:renderEditor,acquire:renderAcquire,tasks:renderTasks,settings:renderSettings})[ui.page]();
  WorkspaceTabs.afterRender();
  WorkbenchMotion.afterRender();
}
function heading(title, subtitle, actions='') {
  return `<div class="page-heading"><div><h1>${escapeHtml(title)}</h1><p>${subtitle}</p></div><div class="actions">${actions}</div></div>`;
}
function filterTabs() {
  return `<div class="filter-tabs">${[['all','全部'],['pending','待整理'],['done','已整理']].map(([id,label])=>`<button data-filter="${id}" class="${ui.filter===id?'active':''}" aria-pressed="${ui.filter===id}">${label}</button>`).join('')}</div>`;
}
function renderLibrary() {
  const previousKey=document.querySelector('.table-scroll')?.dataset.scrollKey;
  captureLibraryScroll();
  const items=visibleFiles(), trash=ui.scope==='trash';
  const title=scopeName(),courseScope=WorkbenchBusiness.enabled&&courses.some(course=>course.id===ui.scope&&course.id!=='unfiled');
  const focused=items.find(file=>file.id===ui.focused);
  const showDetails=ui.details&&focused;
  document.querySelector('#page').innerHTML=heading(title,`${ui.scope==='recent'?'最近访问的课件':WorkbenchBusiness.enabled?'本地资料库':'2026 秋季学期'}<span style="padding:0 9px">·</span>${items.length} 份课件`,trash?'':(courseScope?button('课程信息','edit-course','settings','optional'):button('新建课程','new-course','plus','optional'))+(courseScope&&items.some(file=>file.review!=='done')?button('整理待整理','review-pending','check','button optional'):'')+button('导入文件','import','upload','button')+button('获取课件','acquire','download','primary'))+`<div class="toolbar"><label class="search">${icon('search')}<input id="file-search" placeholder="搜索课件、课程或日期" aria-label="搜索课件" value="${escapeHtml(ui.query)}"></label>${trash?'':filterTabs()}<span class="spacer"></span>${WorkbenchBusiness.enabled?iconButton('range','按日期筛选','library-range',!!(ui.dateFrom||ui.dateTo)):''}<select id="sort-files" class="sort-select" aria-label="课件排序"><option value="recent">${ui.scope==='recent'?'最近打开':'日期降序'}</option><option value="name" ${ui.sort==='name'?'selected':''}>名称排序</option></select><i class="separator"></i><div class="view-controls">${iconButton('list','列表视图','list',ui.view==='list')}${iconButton('grid','预览视图','grid',ui.view==='grid')}</div></div>${ui.selected.size?`<div class="batch-toolbar"><strong>${ui.selected.size}</strong> 份已选择<span class="spacer"></span>${trash?button('恢复课件','restore-selected','refresh','primary'):(WorkbenchBusiness.enabled?button('整理选中','review-queue','check','button')+button('归入课程','assign-selected','folder','button'):'')+button('标记已整理','review-selected','check','button')+button('导出选中','export-selected','export','primary')}${iconButton('close','取消选择','clear-selection')}</div>`:''}<div class="list-layout ${showDetails?'with-details':''}"><section class="file-list"><div class="table-scroll">${items.length?ui.view==='list'?fileTable(items):fileGrid(items):`<div class="empty">${icon(trash?'trash':'search')}<h2>${ui.query?'未找到匹配课件':trash?'回收站为空':'没有相关课件'}</h2><p>${ui.query?'试试课程名称或上课日期。':trash?'移入回收站的课件可以恢复，已导出的文件不受影响。':'可以导入本地文件，或连接平台获取课件。'}</p></div>`}</div><div class="list-footer"><span>${items.length} 份课件${ui.selected.size?` · 已选择 ${ui.selected.size} 份`:''}</span><span>${trash?'选择课件后恢复':'单击查看详情，双击开始整理'}</span></div></section>${showDetails?fileDetails(focused):''}</div>`;
  const selectAll=document.querySelector('#select-all');
  if(selectAll)selectAll.indeterminate=items.some(file=>ui.selected.has(file.id))&&!items.every(file=>ui.selected.has(file.id));
  const scroll=document.querySelector('.table-scroll');
  scroll.dataset.scrollKey=libraryKey();scroll.scrollTop=libraryScroll.get(libraryKey())||0;
  if(previousKey&&previousKey!==libraryKey()){WorkbenchMotion.enter(scroll);WorkbenchMotion.remember();}
}
function fileTable(items) {
  const all=items.every(file=>ui.selected.has(file.id));
  return `<table class="file-table library-table ${ui.selected.size?'selecting':''}"><thead><tr>
    <th class="col-check"><input type="checkbox" id="select-all" aria-label="选择当前所有课件" ${all?'checked':''}></th><th class="col-name">课件名称</th><th class="col-course">课程</th><th class="col-date">上课日期</th><th class="col-pages">页数</th><th class="col-status">整理状态</th><th class="col-actions">操作</th>
  </tr></thead><tbody>${items.map(file=>`<tr data-file="${file.id}" tabindex="0" class="${ui.focused===file.id?'focused':''} ${ui.selected.has(file.id)?'checked':''}" aria-label="${escapeHtml(file.title)}">
    <td class="col-check"><input type="checkbox" data-check="${file.id}" aria-label="选择${escapeHtml(file.title)}" ${ui.selected.has(file.id)?'checked':''}></td>
    <td><div class="file-name"><span class="document-icon" style="--course-ink:${courseOf(file).color}">${icon('file')}</span><div><strong title="${escapeHtml(file.title)}">${escapeHtml(file.title)}</strong><small><span class="inline-course">${escapeHtml(courseOf(file).name)} · </span><span class="export-state ${file.exported?'exported':''}">${file.exported?icon('check'):''}${file.exported?'已导出 PDF':'未导出'}</span>${file.excluded.size?` · 排除 ${file.excluded.size} 页`:''}</small></div></div></td>
    <td class="col-course ellipsis">${escapeHtml(courseOf(file).name)}</td><td class="col-date numeric">${file.date.slice(5).replace('-',' / ')}</td><td class="col-pages numeric">${file.pages-file.excluded.size}</td><td class="col-status">${status(file)}</td>
    <td class="col-actions"><div class="row-actions">${button(file.deleted?'恢复':'整理',file.deleted?'restore-row':'open-row','','row-quick-action',`data-target-file="${file.id}" title="${file.deleted?'恢复':'打开整理'} ${escapeHtml(file.title)}" aria-label="${file.deleted?'恢复':'整理'} ${escapeHtml(file.title)}"`)}${button('','file-menu','more','icon-button',`data-file-id="${file.id}" title="更多操作" aria-label="${escapeHtml(file.title)}的更多操作"`)}</div></td>
  </tr>`).join('')}</tbody></table>`;
}
function fileGrid(items) {
  return `<div class="file-grid">${items.map(file=>`<article class="file-card ${ui.focused===file.id?'focused':''} ${ui.selected.has(file.id)?'checked':''}">
    <label class="card-check"><input type="checkbox" data-check="${file.id}" aria-label="选择${escapeHtml(file.title)}" ${ui.selected.has(file.id)?'checked':''}></label>
    <button class="file-card-open" data-file="${file.id}" aria-label="${escapeHtml(file.title)}">${slideSvg(file,1,true,true)}<span class="card-title ellipsis">${escapeHtml(file.title)}</span><span class="card-meta"><span>${escapeHtml(courseOf(file).name)} · ${file.pages} 页</span>${status(file)}</span></button>
  </article>`).join('')}</div>`;
}
function fileDetails(file) {
  return `<aside class="details"><div class="panel-heading">课件详情<span class="spacer"></span>${button('','file-menu','more','icon-button',`data-file-id="${file.id}" aria-label="课件操作"`)}${iconButton('close','关闭详情','details')}</div><div class="details-preview">${slideSvg(file,1,true,true)}</div><h2>${escapeHtml(file.title)}</h2><p class="details-subtitle">${escapeHtml(courseOf(file).name)}</p><dl><dt>上课日期</dt><dd>${file.date}</dd><dt>原始页数</dt><dd>${file.pages} 页</dd><dt>保留页面</dt><dd>${file.pages-file.excluded.size} 页</dd><dt>整理状态</dt><dd>${status(file)}</dd><dt>导出状态</dt><dd>${stateBadge(file.exported?'已导出':'未导出',file.exported?'success':'neutral',file.exported?'check':'file')}</dd></dl>${file.deleted?button('恢复课件','restore-focused','refresh','primary wide'):button('打开整理','open-focused','arrow','primary wide')}<div class="details-section">${file.deleted?'':button('导出 PDF','export-focused','export','button wide')}<p class="details-note">可以直接导出当前保留页面，无需先完成整理。</p></div></aside>`;
}

function settingSwitch(value,action,label) {
  return `<div class="setting-switch"><span>${value?'已开启':'已关闭'}</span><button class="toggle ${value?'on':''}" role="switch" aria-label="${label}" aria-checked="${value}" data-action="${action}"><i></i></button></div>`;
}
function updateSettingSwitch(value,action) {
  const toggle=document.querySelector(`[data-action="${action}"]`);
  if(!toggle)return;
  toggle.classList.toggle('on',value);toggle.setAttribute('aria-checked',String(value));
  toggle.closest('.setting-switch').querySelector('span').textContent=value?'已开启':'已关闭';
}
function renderSettings() {
  const scroll=document.querySelector('#page > .content')?.scrollTop||0;
  const live=WorkbenchBusiness.enabled,s=live?WorkbenchBusiness.snapshot.settings:{},prefs=live?WorkbenchBusiness.snapshot.updatePreferences||{}:{};
  const pathRow=(label,path,controls)=>`<div class="preference-row directory-row"><div class="preference-copy"><strong>${label}</strong><small class="directory-path" title="${escapeHtml(path)}">${escapeHtml(path)}</small></div><div class="preference-actions">${controls}</div></div>`;
  const libraryPath=live?s.libraryDir:'D:\\华工课栈资料库';
  document.querySelector('#page').innerHTML=heading('设置','管理本地资料、下载与导出偏好。')+`
    <div class="content settings-scroll"><div class="settings-content preferences-sheet">
      <section class="preference-group"><h2>${icon('folder')}资料与存储</h2>
        ${pathRow('资料库',libraryPath,(live?button('打开','open-library','folder','button'):'')+button('切换','library-dir','','button'))}
        <div class="preference-note">${icon('check')}原始页面保留，整理进度自动保存${!live?settingSwitch(ui.autoSave,'auto-save','自动保存'):''}</div>
      </section>
      <section class="preference-group"><h2>${icon('download')}获取与导出</h2>
        <label class="preference-row"><span class="preference-label">获取课件后</span><select id="download-after" aria-label="获取课件后的行为"><option value="store" ${ui.downloadAfter==='store'?'selected':''}>保存到资料库</option><option value="export" ${ui.downloadAfter==='export'?'selected':''}>直接导出 PDF</option></select></label>
        <label class="preference-row"><span class="preference-label">同时获取课件数</span><select id="download-workers" aria-label="同时获取数量">${[1,2,3,4].map(n=>`<option value="${n}" ${ui.workers===String(n)?'selected':''}>${n} 份</option>`).join('')}</select></label>
        ${pathRow('默认导出目录',ui.exportDir||'尚未设置 · 首次导出时选择',button('选择','export-dir','folder','button'))}
        ${live?`<details class="download-options" ${ui.downloadOptionsOpen?'open':''}><summary><span>高级下载参数</span><small>超时 ${s.timeout??30} 秒 · 尝试 ${s.retries??3} 次</small>${icon('down')}</summary><div class="download-options-grid">${[['timeout','请求超时（秒）',5,600,30],['retries','下载尝试次数',1,10,3],['sleepMs','请求间隔（毫秒）',0,5000,100]].map(([key,label,min,max,fallback])=>`<label>${label}<input type="number" id="setting-${key}" min="${min}" max="${max}" value="${ui.downloadDraft[key]??s[key]??fallback}" required></label>`).join('')}</div><div class="preference-actions">${button('保存参数','save-download-settings','check','button')}</div></details>`:''}
      </section>
      <section class="preference-group"><h2>${icon('settings')}应用</h2>
        <div class="preference-reminders"><div class="preference-row"><span class="preference-label">启动时检查更新</span>${settingSwitch(ui.updateCheck,'update-check','启动时检查更新')}</div>${live?`<div class="preference-row"><span class="preference-label">启动时提示公告</span>${settingSwitch(WorkbenchBulletins.autoShow,'announcement-auto','启动时提示公告')}</div>`:''}</div>
        ${prefs.ignoredVersion||prefs.remindAfter>Date.now()?`<div class="preference-row"><div class="preference-copy"><strong>更新提醒</strong><small>${prefs.ignoredVersion?'已忽略版本 '+escapeHtml(prefs.ignoredVersion):'已推迟提醒'}</small></div>${button('恢复提醒','reset-update-reminders','','button')}</div>`:''}
        <div class="preference-row"><div class="preference-copy"><strong>华工课栈${live?' · v'+escapeHtml(WorkbenchBusiness.snapshot.appVersion):' · 界面预览'}</strong><small>个人课件整理工具</small></div><div class="preference-actions">${live?button('公告与更新','bulletins','bell','button'):''}${button('关于','help','','button')}</div></div>
      </section>
    </div></div>`;
  document.querySelector('#page > .content').scrollTop=scroll;
}

function showDialog(title, body, actions='') {
  hideAppMenu(false);
  WorkspaceTabs.hideList();
  dialog.style.width='';
  dialog.removeAttribute('aria-label');
  dialog.setAttribute('aria-labelledby','dialog-title');
  dialog.innerHTML=`<div class="dialog-heading"><h2 id="dialog-title">${title}</h2>${iconButton('close','关闭','close-dialog')}</div><div class="dialog-body">${body}</div>${actions?`<div class="dialog-actions">${actions}</div>`:''}`;
  if(!dialog.open)dialog.showModal();
  requestAnimationFrame(()=>dialog.querySelector('input:not([readonly]), select')?.focus());
}
function showCommand() {
  hideAppMenu(false);
  WorkspaceTabs.hideList();
  dialog.style.width='500px';
  dialog.removeAttribute('aria-labelledby');dialog.setAttribute('aria-label','搜索与跳转');
  dialog.innerHTML=`<div class="command-search">${icon('search')}<input id="command-input" placeholder="搜索课程、课件或操作…" aria-label="搜索与跳转" autocomplete="off"><kbd>Esc</kbd></div><div id="command-results" class="command-results"></div>`;
  if(!dialog.open)dialog.showModal();
  filterCommands('');setTimeout(()=>document.querySelector('#command-input')?.focus(),0);
}
function filterCommands(query) {
  const options=[...courses.map(course=>({name:course.name,type:'课程',scope:course.id,symbol:'folder'})),...files.filter(file=>!file.deleted).map(file=>({name:file.title,type:courseOf(file).name,id:file.id,symbol:'file'})),{name:'获取课件',type:'操作',action:'acquire',symbol:'download'},{name:'设置',type:'操作',action:'settings',symbol:'settings'}];
  document.querySelector('#command-results').innerHTML=options.filter(option=>option.name.includes(query)).map(option=>`<button ${option.scope?`data-command-scope="${option.scope}"`:option.id?`data-command-file="${option.id}"`:`data-command-action="${option.action}"`}>${icon(option.symbol)}<span>${escapeHtml(option.name)}</span><small>${escapeHtml(option.type)}</small></button>`).join('')||'<div class="empty"><p>没有找到匹配项</p></div>';
}
const actions = {
  'manage-course':el=>CourseManagement.edit(el.dataset.courseId),'edit-course':()=>CourseManagement.edit(ui.scope),
  'save-course':CourseManagement.simulateSave,'delete-course':CourseManagement.confirm,'confirm-delete-course':CourseManagement.simulateDelete,
  'undo-course-delete':el=>CourseManagement.simulateUndo(el.dataset.operationId),
  'library-range':()=>showDialog('按上课日期筛选',`<label>开始日期<input id="library-from" type="date" value="${ui.dateFrom}"></label><label>结束日期<input id="library-to" type="date" value="${ui.dateTo}"></label>`,button('清除筛选','clear-library-range','','button')+button('应用','confirm-library-range','check','primary')),
  'confirm-library-range':()=>{const from=document.getElementById('library-from').value,to=document.getElementById('library-to').value;if(from&&to&&from>to)return fieldError('开始日期不能晚于结束日期。','library-from');ui.dateFrom=from;ui.dateTo=to;ui.selected.clear();dialog.close();render();},
  'clear-library-range':()=>{ui.dateFrom='';ui.dateTo='';ui.selected.clear();dialog.close();render();},
  'close-tab':element=>WorkspaceTabs.close(element.dataset.tabId,{focus:true}),
  'tab-list':()=>WorkspaceTabs.showList(),
  'app-menu':showAppMenu, 'open-row':element=>openFile(element.dataset.targetFile), 'restore-row':element=>restoreLibraryFile(element.dataset.targetFile),
  navigation:()=>{ui.compact=!ui.compact;render();},
  details:()=>{if(ui.page==='editor')return showViewer();ui.details=!ui.details;if(ui.page==='library'&&!ui.focused)ui.focused=visibleFiles()[0]?.id;render();},
  list:()=>{ui.view='list';render();}, grid:()=>{ui.view='grid';render();},
  'close-dialog':()=>dialog.close(),command:showCommand,
  fullscreen:showViewer,'close-viewer':closeViewer,'page-filter-all':()=>setPageFilter(false),'page-filter-kept':()=>setPageFilter(true),
  'select-pages':toggleAllPages,'page-range':showPageRange,'confirm-page-range':confirmPageRange,
  'exclude-selected':()=>mutatePages([...reviewUi.selected],true),'restore-selected-pages':()=>mutatePages([...reviewUi.selected],false),
  'clear-pages':()=>{reviewUi.selected.clear();syncReviewSelection();},
  'crop-all':()=>applyCropToPages(Array.from({length:currentFile().pages},(_,n)=>n+1)),
  'crop-selected':()=>applyCropToPages([...reviewUi.selected]),
  'cancel-crop':()=>{ui.crop=null;renderViewer();},
  acquire:()=>navigate('acquire'),settings:()=>navigate('settings'),
  'show-library':()=>navigate('library','all'),reconnect:()=>{ui.connected=false;toggleConnection();},
  'open-focused':()=>openFile(ui.focused), 'open-sample':()=>openFile('ml9'),
  'open-task':element=>openFile(element.dataset.targetFile),
  'export-focused':()=>showExport([ui.focused]), 'restore-focused':()=>{ui.menuFile=ui.focused;actions['restore-file']();}, 'export-current':()=>showExport([ui.openFile]),
  'export-selected':()=>showExport([...ui.selected]),
  'clear-selection':()=>{ui.selected.clear();render();},
  'review-selected':()=>{files.forEach(file=>{if(ui.selected.has(file.id))file.review='done';});ui.selected.clear();render();notify('已标记为整理完成。','success');},
  'restore-selected':()=>{files.forEach(file=>{if(ui.selected.has(file.id))file.deleted=false;});ui.selected.clear();render();notify('所选课件已恢复。','success');},
  'new-course':()=>showDialog('新建课程','<label>课程名称<input id="new-course-name" placeholder="输入课程名称" maxlength="40"></label><label>学期<input id="new-course-term" '+(WorkbenchBusiness.enabled?'placeholder="学期或班级（选填）"':'value="2026 秋季学期" readonly')+'></label>',button('取消','close-dialog','','button')+button('创建课程','create-course','plus','primary')),
  'create-course':createCourse,
  import:()=>showDialog('导入本地文件','<p>图片可合成一份课件，多个 PDF 分别导入。本方案只展示文件选择，不读取文件内容。</p><label>归入课程<select id="import-course">'+courses.map(course=>`<option value="${course.id}" ${ui.scope===course.id?'selected':''}>${escapeHtml(course.name)}</option>`).join('')+'</select></label><label>选择文件<input id="import-files" type="file" accept="image/*,.pdf" multiple></label>',button('取消','close-dialog','','button')+button('确认导入','confirm-import','upload','primary')),
  'confirm-import':confirmImport,
  'confirm-export':confirmExport,
  'file-menu':element=>{ui.menuFile=element.dataset.fileId;const file=files.find(file=>file.id===ui.menuFile);showDialog('课件操作',`<p>${escapeHtml(file.title)}</p><div class="command-results">${file.deleted?button('恢复课件','restore-file','refresh'):button('打开整理','open-menu-file','file')+button('导出 PDF','export-menu-file','export')+button('重命名','rename-file','file')+(WorkbenchBusiness.enabled?button('归入课程','assign-course','folder'):'')+button('移入回收站','trash-file','trash')}</div>`);},
  'open-menu-file':()=>{dialog.close();openFile(ui.menuFile);},
  'export-menu-file':()=>showExport([ui.menuFile]),
  'trash-file':()=>{files.find(file=>file.id===ui.menuFile).deleted=true;ui.selected.delete(ui.menuFile);ui.focused=null;dialog.close();WorkspaceTabs.close('file:'+ui.menuFile);navigate('library');notify('课件已移入回收站，可随时恢复。');},
  'restore-file':()=>{dialog.close();restoreLibraryFile(ui.menuFile);},
  'rename-file':()=>showDialog('重命名课件',`<label>课件名称<input id="rename-value" value="${escapeHtml(files.find(file=>file.id===ui.menuFile).title)}"></label>`,button('取消','close-dialog','','button')+button('保存','confirm-rename','check','primary')),
  'confirm-rename':confirmRename,
  previous:()=>stepPage(-1),next:()=>stepPage(1),
  exclude:()=>setExcluded(!currentFile().excluded.has(ui.current)),keep:()=>setExcluded(false),remove:()=>setExcluded(true),
  undo,crop:cropAction,
  'reset-crop':resetCrop,
  kept:()=>setPageFilter(!ui.onlyKept),
  complete:()=>{if(currentFile().review==='done')return;currentFile().review='done';refreshReview();notify('当前课件已完成整理，可继续查看或导出。','success');},
  overview:()=>{closeViewer();render();},
  connect:toggleConnection,
  scan:scanCourses,
  download:downloadSelection,
  pause:toggleTask, 'cancel-task':cancelTask,
  'task-info':()=>showDialog('课件获取说明','<p>原始第 18 页在平台上暂不可用。其余页面已经保存，可以正常整理和导出。</p><div class="path-display">保留页面：28 页<br><br>缺少原始页码：18</div>',button('关闭','close-dialog','','button')),
  'auto-save':()=>{ui.autoSave=!ui.autoSave;updateSettingSwitch(ui.autoSave,'auto-save');},'update-check':()=>{ui.updateCheck=!ui.updateCheck;updateSettingSwitch(ui.updateCheck,'update-check');},
  'export-dir':()=>showDialog('导出目录',`<label>目录路径<input id="directory-value" value="${escapeHtml(ui.exportDir)}"></label><p>仅更新本次界面预览中的路径，不会访问或创建文件夹。</p>`,button('取消','close-dialog','','button')+button('保存','save-directory','check','primary')),
  'save-directory':()=>{const value=document.querySelector('#directory-value').value.trim();if(!value)return;ui.exportDir=value;dialog.close();render();notify('导出目录已更新。','success');},
  'library-dir':()=>showDialog('资料库位置','<p>此方案使用内存中的示例资料库，尚未连接实际存储。正式接入后可在这里选择资料库目录。</p>',button('关闭','close-dialog','','button')),
  'dialog-acquire':()=>{dialog.close();navigate('acquire');},
  'dialog-undo':()=>{dialog.close();if(ui.page==='editor')undo();else notify('进入课件整理后可撤销页面操作。');},
  'dialog-navigation':()=>{dialog.close();actions.navigation();},'dialog-details':()=>{dialog.close();actions.details();},
  'dialog-list':()=>{dialog.close();ui.view='list';navigate('library');},'dialog-grid':()=>{dialog.close();ui.view='grid';navigate('library');},
  help:()=>showDialog('华工课栈 · 新工作台','<p>课程目录用于缩小范围，课件列表用于管理，独立文档页用于整理。单击课件查看详情，双击开始整理。</p><p>这份方案从空白重新编写。所有课程、课件和页面均为示例；不连接学校平台，不访问实际资料库，刷新即恢复初始状态。</p><div class="shortcuts"><kbd>Ctrl K</kbd>　搜索与跳转<br><kbd>←</kbd> <kbd>→</kbd>　翻页<br><kbd>E</kbd>　排除 / 恢复<br><kbd>C</kbd>　裁剪　<kbd>Enter</kbd>　确认<br><kbd>Ctrl Z</kbd>　撤销</div>',button('知道了','close-dialog','','primary')),
  'window-minimize':()=>window.__TAURI_INTERNALS__?.invoke('plugin:window|minimize',{label:'main'}),
  'window-maximize':()=>window.__TAURI_INTERNALS__?.invoke('plugin:window|toggle_maximize',{label:'main'}),
  'window-close':()=>window.__TAURI_INTERNALS__?.invoke('plugin:window|close',{label:'main'}),
};

document.addEventListener('click',event=>{
  if(event.target.closest('input,select'))return;
  const buttonElement=event.target.closest('button');
  if(buttonElement?.disabled)return;
  const data=buttonElement?.dataset;
  if(data?.tab){WorkspaceTabs.hideList();WorkspaceTabs.activate(data.tab,{focus:true});return;}
  if(data?.commandScope){dialog.close();navigate('library',data.commandScope);return;}
  if(data?.commandFile){dialog.close();openFile(data.commandFile);return;}
  if(data?.commandAction){dialog.close();dispatchAction(data.commandAction);return;}
  if(data?.page){navigate(data.page);return;}
  if(data?.scope){navigate('library',data.scope);return;}
  if(data?.open){openFile(data.open);return;}
  if(data?.preview){selectPage(Number(data.preview));return;}
  if(data?.togglePage){const page=Number(data.togglePage);mutatePages([page],!currentFile().excluded.has(page));return;}
  if(data?.slide){selectPage(Number(data.slide));return;}
  if(data?.overview){dialog.close();selectPage(Number(data.overview));return;}
  if(data?.filter){ui.filter=data.filter;ui.selected.clear();render();return;}
  if(data?.taskFilter){ui.tasksFilter=data.taskFilter;render();return;}
  if(data?.scanExpand){
    const id=data.scanExpand,expanded=!ui.scanExpanded.has(id),keyboard=event.detail===0||buttonElement.matches(':focus-visible'),arrow=buttonElement.classList.contains('scan-expand');expanded?ui.scanExpanded.add(id):ui.scanExpanded.delete(id);
    renderAcquire();if(keyboard)document.querySelector(`[data-scan-expand="${CSS.escape(id)}"].${arrow?'scan-expand':'scan-course-title'}`)?.focus({preventScroll:true});
    if(expanded)WorkbenchMotion.enter(document.getElementById('scan-lessons-'+id));return;
  }
  if(data?.action){if(buttonElement.closest('#app-menu'))hideAppMenu(false);dispatchAction(data.action,buttonElement);return;}
  const row=event.target.closest('[data-file]');
  if(row){ui.focused=row.dataset.file;ui.details=true;const scroll=document.querySelector('.table-scroll').scrollTop;render();document.querySelector('.table-scroll').scrollTop=scroll;document.querySelector('[data-file="'+ui.focused+'"]')?.focus({preventScroll:true});}
});
// Delay-free detail selection replaces rows, so double-clicks are detected across renders.
let lastClick={id:null,time:0};
document.addEventListener('pointerdown',event=>{
  if(event.target.closest('.review-check'))reviewUi.shift=event.shiftKey;
  if(event.target.closest('input,button[data-action]'))return;
  const preview=event.target.closest('[data-preview]');
  if(preview){const now=performance.now();if(lastClick.id==='page-'+preview.dataset.preview&&now-lastClick.time<420){event.preventDefault();selectPage(Number(preview.dataset.preview));showViewer();lastClick={id:null,time:0};}else lastClick={id:'page-'+preview.dataset.preview,time:now};}
  const row=event.target.closest('[data-file]');
  if(row){const now=performance.now();if(lastClick.id===row.dataset.file&&now-lastClick.time<420){event.preventDefault();openFile(row.dataset.file);lastClick={id:null,time:0};}else lastClick={id:row.dataset.file,time:now};}
  if(window.__TAURI_INTERNALS__&&event.button===0&&event.target.closest('.windowbar')&&!event.target.closest('button'))window.__TAURI_INTERNALS__.invoke('plugin:window|start_dragging',{label:'main'}).catch(()=>{});
});
document.addEventListener('change',event=>{
  const target=event.target;
  if(target.dataset.pageCheck){selectReviewPage(Number(target.dataset.pageCheck),target.checked,reviewUi.shift);reviewUi.shift=false;return;}
  if(target.dataset.check){target.checked?ui.selected.add(target.dataset.check):ui.selected.delete(target.dataset.check);render();}
  if(target.id==='select-all'){ui.selected=target.checked?new Set(visibleFiles().map(file=>file.id)):new Set();render();}
  if(target.id==='sort-files'){ui.sort=target.value;render();}
  if(target.id==='scan-start'){ui.scanStart=target.value;invalidateScan();}
  if(target.id==='scan-end'){ui.scanEnd=target.value;invalidateScan();}
  if(target.id==='download-after'){ui.downloadAfter=target.value;if(WorkbenchBusiness.enabled)void WorkbenchBusiness.saveSetting({exportMode:target.value==='export'?'direct':'review'});else ui.scanDirectExport=target.value==='export';}
  if(target.id==='download-workers'){ui.workers=target.value;if(WorkbenchBusiness.enabled)void WorkbenchBusiness.saveSetting({maxWorkers:Number(target.value)});}
  if(target.id==='export-mode'){
    const separate=target.value==='separate';
    if(document.querySelector('#export-name-field'))document.querySelector('#export-name-field').hidden=separate;
    if(document.querySelector('#separate-hint'))document.querySelector('#separate-hint').hidden=!separate;
  }
  if(target.id==='page-number')selectPage(Number(target.value)||1);
  if(target.dataset.scan){if(!scanUnavailable(target.dataset.scan))target.checked?ui.scanSelected.add(target.dataset.scan):ui.scanSelected.delete(target.dataset.scan);renderAcquire();}
  if(target.dataset.scanGroup){const group=acquisitionGroups().find(group=>group.id===target.dataset.scanGroup);group?.eligible.forEach(row=>target.checked?ui.scanSelected.add(row.id):ui.scanSelected.delete(row.id));renderAcquire();}
  if(target.id==='scan-all'){ui.scanSelected=target.checked?new Set(scanRows().filter(row=>!scanUnavailable(row.id)).map(row=>row.id)):new Set();renderAcquire();}
  if(target.id==='scan-direct-export')ui.scanDirectExport=target.checked;
});
document.addEventListener('input',event=>{
  if(event.target.id.startsWith('setting-'))ui.downloadDraft[event.target.id.slice(8)]=event.target.value;
  if(event.target.id==='command-input')filterCommands(event.target.value);
  if(event.target.id==='file-search'&&!event.isComposing){const value=event.target.value,position=event.target.selectionStart;ui.query=value;ui.selected.clear();renderLibrary();const input=document.querySelector('#file-search');input.focus();input.setSelectionRange(position,position);}
});
document.addEventListener('toggle',event=>{if(event.target.matches?.('.download-options')&&event.target.isConnected)ui.downloadOptionsOpen=event.target.open;},true);
document.addEventListener('compositionend',event=>{if(event.target.id==='file-search'){ui.query=event.target.value;ui.selected.clear();renderLibrary();document.querySelector('#file-search').focus();}});
document.addEventListener('keydown',event=>{
  if(document.querySelector('#bulletin-dialog[open]'))return;
  const tabMenu=document.querySelector('#tab-menu');
  if(tabMenu.matches(':popover-open')){
    if(event.key==='Escape'||event.key==='Tab'){if(event.key==='Escape')event.preventDefault();WorkspaceTabs.hideList(true);return;}
    if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
      event.preventDefault();const tabs=[...tabMenu.querySelectorAll('[role=menuitem]')],index=tabs.indexOf(document.activeElement);
      const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowUp'?-1:1)+tabs.length)%tabs.length;
      tabs[next]?.focus();return;
    }
    if(event.key==='Enter'||event.key===' '){event.preventDefault();document.activeElement.closest('#tab-menu button')?.click();return;}
    if(!event.ctrlKey&&!event.metaKey)return;
  }
  const menu=document.querySelector('#app-menu');
  if(menu.matches(':popover-open')&&!event.ctrlKey&&!event.metaKey){
    if(event.key==='Escape'){event.preventDefault();hideAppMenu(true);return;}
    if(event.key==='Tab'){hideAppMenu(true);return;}
    if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
      event.preventDefault();const items=[...menu.querySelectorAll('[role=menuitem]:not(:disabled)')],index=items.indexOf(document.activeElement);
      const next=event.key==='Home'?0:event.key==='End'?items.length-1:(index+(event.key==='ArrowUp'?-1:1)+items.length)%items.length;
      items[next]?.focus();return;
    }
    if(event.key==='Enter'||event.key===' '){event.preventDefault();document.activeElement.closest('#app-menu button')?.click();return;}
    return;
  }
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){event.preventDefault();showCommand();return;}
  if(dialog.open){if(event.key==='Escape'){event.preventDefault();dialog.close();return;}if(event.key==='Enter'&&!event.isComposing){if(event.target.id==='command-input'){event.preventDefault();document.querySelector('.command-results button')?.click();}else if(event.target.matches('input:not([type=file])')){event.preventDefault();dialog.querySelector('.dialog-actions .primary')?.click();}}return;}
  if(!viewerOpen()&&(event.ctrlKey||event.metaKey)&&['Tab','w','W'].includes(event.key)){
    event.preventDefault();WorkspaceTabs.hideList();
    if(event.key==='Tab')WorkspaceTabs.step(event.shiftKey?-1:1);
    else WorkspaceTabs.close(WorkspaceTabs.activeId,{focus:true});
    return;
  }
  if(event.target.matches('input,select,textarea'))return;
  if(event.target.matches('.document-tab')&&event.key==='Delete'){event.preventDefault();WorkspaceTabs.close(event.target.dataset.tab,{focus:true});return;}
  if(event.target.matches('.document-tab')&&['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){
    event.preventDefault();
    const tabs=[...document.querySelectorAll('.document-tab:not(:disabled)')],index=tabs.indexOf(event.target);
    const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowLeft'?-1:1)+tabs.length)%tabs.length;
    tabs[next].click();document.querySelectorAll('.document-tab:not(:disabled)')[next]?.focus();return;
  }
  if(ui.page==='library'&&event.key==='Enter'&&event.target.closest('[data-file]')){openFile(event.target.closest('[data-file]').dataset.file);return;}
  if(ui.page!=='editor')return;
  handleReviewKey(event);
});
document.querySelector('#app-menu').addEventListener('toggle',()=>document.querySelector('#app-menu-trigger')?.setAttribute('aria-expanded',String(document.querySelector('#app-menu').matches(':popover-open'))));
document.querySelector('#tab-menu').addEventListener('toggle',()=>document.querySelector('[data-action="tab-list"]')?.setAttribute('aria-expanded',String(document.querySelector('#tab-menu').matches(':popover-open'))));
document.addEventListener('auxclick',event=>{if(event.button!==1)return;const tab=event.target.closest('.document-tab-slot')?.querySelector('[data-tab]');if(tab){event.preventDefault();WorkspaceTabs.close(tab.dataset.tab,{focus:true});}});
window.addEventListener('resize',()=>{hideAppMenu(false);WorkspaceTabs.hideList();});
document.querySelector('#viewer').addEventListener('cancel',event=>{event.preventDefault();if(ui.crop){ui.crop=null;renderViewer();}else closeViewer();});
dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const box=dialog.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)dialog.close();});
function dispatchAction(name,element){if(WorkbenchBulletins.handleAction(name,element))return;if(!WorkbenchBusiness.handleAction(name,element))actions[name]?.(element);}
if(WorkbenchBusiness.enabled)root.innerHTML='<div class="empty"><h2>正在打开资料库…</h2><p>读取本地课程、课件与任务。</p></div>';
else render();
