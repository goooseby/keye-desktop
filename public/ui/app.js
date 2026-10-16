'use strict';

let state={materials:[],tasks:[],settings:{exportMode:'review'},lastMaterial:null};
let availableCourses=[];
let desktop=null;
let ready=false;
const updateState={info:null,checking:false,downloading:false,ready:false,progress:0,error:''};
const storageOK=true;
const pending=new Map();
let sequence=0;
let autoScanTimer=null;
let autoScanRequested=false;
let fullscreenPreloads=[];
let fullscreenFrame=null;
let fullscreenImageRequest=0;
let editorImageRequest=0;
let lastPageTimer=null;
let pendingLastPage=null;
let cropGesture=null;
let cropSavedAt=false;
let cropSavedTimer=null;
let cropNudgeTimer=null;
const today=new Date();
const dateString=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const weekAgo=new Date(today);weekAgo.setDate(today.getDate()-6);
const view={page:'library',filter:'all',search:'',sort:'recent',materialId:null,pageFilter:'all',selected:new Set(),
  currentPage:1,undo:[],scanSelected:new Set(),loggedIn:false,scanned:false,scanning:false,taskFilter:'all',
  scanStart:dateString(weekAgo),scanEnd:dateString(today),directExport:false,saving:false,
  selectionAnchor:null,pageShiftPending:false};
const main=document.querySelector('#main'),modal=document.querySelector('#modal');
const $=selector=>document.querySelector(selector);
const material=()=>state.materials.find(m=>m.id===view.materialId);
const activeMaterials=()=>state.materials.filter(m=>!m.deleted);
const pageList=()=>{const m=material();if(!m)return[];const all=Array.from({length:m.pages},(_,i)=>i+1);return view.pageFilter==='kept'?all.filter(p=>!m.excluded.includes(p)):all;};
const stepTarget=step=>{const pages=pageList();if(!pages.length)return null;if(step<0){for(let i=pages.length-1;i>=0;i--)if(pages[i]<view.currentPage)return pages[i];return null;}for(const p of pages)if(p>view.currentPage)return p;return null;};
const cropsOf=m=>(m&&m.crops)||{};
const cropOf=(m,page)=>cropsOf(m)[String(page)]||null;
const cropCount=(m,keptOnly=false)=>{const crops=cropsOf(m);return Object.keys(crops).filter(k=>!keptOnly||!m.excluded.includes(Number(k))).length;};
const fullCrop=()=>({x:0,y:0,w:1,h:1});
const round6=value=>Math.round(value*1e6)/1e6;
const statusOf=m=>m.exported?(m.revision===m.exportRevision?'exported':'changed'):m.edited?'editing':'pending';
const statuses={pending:'待整理',editing:'整理中',exported:'已导出',changed:'修改后未导出'};
const badge=m=>`<span class="badge ${m.reviewRevision===m.revision?'exported':m.edited?'editing':'pending'}">${m.reviewRevision===m.revision?'已整理':m.edited?'整理中':'待整理'}</span>`;

function call(command,data={}){
  if(!window.keyeInvoke)return Promise.reject(new Error('桌面服务尚未连接，请通过课页启动程序打开。'));
  return window.keyeInvoke(command,data);
}
function toast(message,duration=6500){$('#toast').textContent=message;$('#toast').classList.add('show');clearTimeout(toast.timer);if(duration>0)toast.timer=setTimeout(()=>$('#toast').classList.remove('show'),duration);}
function fail(error){toast(error.message||String(error));}
async function submitExport(command,data,doneMessage){
  if(view.exporting)return toast('正在导出上一份课件，请稍候。');
  view.exporting=true;
  toast('正在生成 PDF，完成后会在这里提示…',0);
  try{
    const result=await call(command,data);
    toast(result?doneMessage:'已取消导出，没有生成文件。');
    return result;
  }finally{view.exporting=false;}
}
function applySnapshot(snapshot){
  const fullscreenOpen=modal.open&&modal.classList.contains('fullscreen-modal');
  const oldMode=state.settings.exportMode;
  const wasLoggedIn=view.loggedIn;
  const wasScanning=view.scanning;
  state=snapshot;
  state.materials.forEach(m=>{let hash=0;for(const c of m.title)hash=(hash*31+c.charCodeAt(0))>>>0;m.tone=['green','blue','sand','purple'][hash%4];});
  availableCourses=snapshot.courses;
  view.loggedIn=snapshot.loggedIn;view.scanned=snapshot.scanned;view.scanning=snapshot.scanning;
  if(!ready||oldMode!==snapshot.settings.exportMode)view.directExport=snapshot.settings.exportMode==='direct';
  ready=true;
  if(!wasLoggedIn&&view.loggedIn&&!snapshot.scanned&&!snapshot.scanning){autoScanRequested=true;setTimeout(()=>scheduleAutoScan(250),0);}
  else if(wasScanning&&!view.scanning&&autoScanRequested)setTimeout(()=>scheduleAutoScan(250),0);
  if(view.page==='editor'&&!activeMaterials().some(m=>m.id===view.materialId)){view.materialId=null;navigate('library');}
  else if(fullscreenOpen){renderShell();scheduleFullscreen();}
  else render();
}
function scheduleAutoScan(delay=650){
  clearTimeout(autoScanTimer);
  autoScanRequested=true;
  if(!view.loggedIn||view.scanning)return;
  autoScanTimer=setTimeout(async()=>{
    if(!view.loggedIn||view.scanning||!view.scanStart||!view.scanEnd||view.scanStart>view.scanEnd)return;
    autoScanRequested=false;
    try{await call('scan',{start:view.scanStart,end:view.scanEnd});}
    catch(error){fail(error);}
  },delay);
}
function hydrate(){document.querySelectorAll('[data-icon]').forEach(el=>el.innerHTML=icon(el.dataset.icon));}
function renderShell(){
  $('#app-version').textContent='v'+(state.appVersion||'0.1.1');
  document.body.classList.toggle('editing-course',view.page==='editor');
  const running=state.tasks.filter(t=>['queued','running','paused'].includes(t.status)).length;
  $('#nav').innerHTML=[['library','资料库','library'],['acquire','获取课件','download'],['tasks','任务','tasks'],['about','关于','about']].map(([id,label,i])=>`<button class="nav-item ${(view.page===id||(id==='library'&&['editor','course'].includes(view.page)))?'active':''}" data-nav="${id}">${icon(i)}${label}${id==='tasks'&&running?`<span class="nav-count">${running}</span>`:''}</button>`).join('');
  $('[data-nav="settings"]').classList.toggle('active',view.page==='settings');
  $('#breadcrumb').innerHTML=`工作空间 <span>/</span> ${view.page==='editor'?`资料库 <span>/</span> ${esc(material()?.title||'课件整理')}`:({course:'课程课件',library:'资料库',acquire:'获取课件',tasks:'任务',about:'关于',settings:'设置'}[view.page])}`;
  const m=view.page==='editor'?material():null;
  $('#statusbar').innerHTML=`<span class="status-left"><i class="dot"></i>${m?`共 ${m.pages} 页 · 保留 ${m.pages-m.excluded.length} 页 · 排除 ${m.excluded.length} 页`:running?`${running} 项后台任务`:'课页 · 资料与整理记录保存在本机'}</span><span>${running?`<button data-nav="tasks">查看 ${running} 项任务 →</button>`:'原始页面保留，随时重新整理'}</span>`;
}
function route(){
  if(!ready)return;
  const [target='library',id]=location.hash.replace(/^#/,'').split('/');
  if(target==='editor'&&activeMaterials().some(m=>m.id===id)){
    if(view.materialId!==id){view.selected.clear();view.selectionAnchor=null;view.undo=[];view.pageFilter='all';view.crop=null;}
    view.materialId=id;view.currentPage=state.materials.find(m=>m.id===id).lastPage||1;view.page='editor';
    state.lastMaterial=id;call('openMaterial',{id}).catch(fail);
  }else if(target==='course'){view.page='course';if(view.courseId!==id){view.courseSelected=new Set();view.courseFilter='all';view.courseFrom='';view.courseTo='';}view.courseId=id;}else view.page=['library','acquire','tasks','about','settings'].includes(target)?target:'library';
  render();main.scrollTop=0;
}
function navigate(page){if(view.saving)return toast('正在保存，请稍候再切换。');if(location.hash===`#${page}`)route();else location.hash=page;}
function render(){renderShell();({library:renderLibrary,course:renderCourse,acquire:renderAcquire,editor:renderEditor,tasks:renderTasks,about:renderAbout,settings:renderSettings}[view.page]||renderLibrary)();hydrate();applyCropViews();}
function cover(m){
  const course=(state.courseLibrary||[]).find(c=>c.id===m.courseId);
  return generatedCover({...m,title:course?.title||m.title,term:course?.term||m.term,
    coverKey:course?.id||m.coverKey||m.courseId||m.id,coverStyle:course?.coverStyle||m.coverStyle,
    coverPalette:course?.coverPalette||m.coverPalette});
}
function slide(m,page=1,thumb=false,raw=false){
  const media=m.media?.[page-1];
  if(!media)return '<div class="empty">页面预览暂不可用</div>';
  const crop=raw?null:cropOf(m,page);
  return `<img class="slide" ${thumb?'loading="lazy"':''} decoding="async" ${crop?`data-crop="${crop.join(',')}"`:''} src="${esc(thumb?media.thumb:media.src)}" alt="${esc(m.title)} · 第 ${page} 页">`;
}
// 勾选状态只改动相关 DOM：不重建网格，避免已裁切的缩略图闪回未裁剪的样子。
function syncSelectionUi(){
  const pages=pageList();
  document.querySelectorAll('[data-page-tile]').forEach(tile=>tile.classList.toggle('selected',view.selected.has(Number(tile.dataset.pageTile))));
  document.querySelectorAll('[data-page-check]').forEach(input=>{input.checked=view.selected.has(Number(input.dataset.pageCheck));});
  const selectAll=$('[data-action="select-all-pages"]');
  if(selectAll)selectAll.textContent=view.selected.size===pages.length&&pages.length?'取消全选':'全选';
  const exclude=$('[data-action="exclude"]'),restore=$('[data-action="restore"]');
  if(exclude)exclude.disabled=!view.selected.size;
  if(restore)restore.disabled=!view.selected.size;
  const label=$('.editor-toolbar .selected-label');
  if(label)label.textContent=`已选中 ${view.selected.size} 页`;
}
function syncImageCrop(image,m,page,raw=false){
  if(!image)return;
  const crop=raw?null:cropOf(m,page);
  if(crop)image.dataset.crop=crop.join(',');else delete image.dataset.crop;
  delete image.dataset.cropReady; // 裁剪样式重算前保持隐藏，避免闪出未裁剪的样子
  image.style.transform='';image.style.clipPath='';
}
function pageBitmapRect(image){const rect=image.getBoundingClientRect(),iw=image.naturalWidth,ih=image.naturalHeight;if(!iw||!ih||!rect.width||!rect.height)return null;const scale=Math.min(rect.width/iw,rect.height/ih),width=iw*scale,height=ih*scale;return {left:rect.left+(rect.width-width)/2,top:rect.top+(rect.height-height)/2,width,height};}
function applyCropViews(root=document){
  const pending=[];
  for(const image of root.querySelectorAll('img.slide[data-crop]')){
    const parts=(image.dataset.crop||'').split(',').map(Number);
    if(parts.length!==4||parts.some(value=>!Number.isFinite(value)))continue;
    if(!image.complete||!image.naturalWidth){ // 还没解码：保持隐藏，解码完成后再补样式
      image.addEventListener('load',()=>applyCropViews(root),{once:true});
      image.addEventListener('error',()=>{image.dataset.cropReady='1';},{once:true});
      continue;
    }
    pending.push([image,parts]);
  }
  if(!pending.length)return;
  for(const [image] of pending){image.style.transform='';image.style.clipPath='';} // 批量复位，否则量到的是上一次变换后的外框
  const boxes=pending.map(([image])=>image.getBoundingClientRect());               // 批量测量：整个循环只触发一次布局
  pending.forEach(([image,parts],index)=>{
    const box=boxes[index],iw=image.naturalWidth,ih=image.naturalHeight;
    if(!box.width||!box.height)return;
    const [cx,cy,cw,ch]=parts;
    const base=Math.min(box.width/iw,box.height/ih);
    const bitmapWidth=iw*base,bitmapHeight=ih*base,bitmapLeft=(box.width-bitmapWidth)/2,bitmapTop=(box.height-bitmapHeight)/2;
    const cropLeft=bitmapLeft+cx*bitmapWidth,cropTop=bitmapTop+cy*bitmapHeight,cropWidth=cw*bitmapWidth,cropHeight=ch*bitmapHeight;
    const fitted=Math.min(box.width/(iw*cw),box.height/(ih*ch));
    const scale=fitted/base,targetWidth=iw*cw*fitted,targetHeight=ih*ch*fitted;
    const targetLeft=(box.width-targetWidth)/2,targetTop=(box.height-targetHeight)/2;
    image.style.transformOrigin='0 0';
    image.style.transform=`translate(${(targetLeft-scale*cropLeft).toFixed(2)}px,${(targetTop-scale*cropTop).toFixed(2)}px) scale(${scale.toFixed(4)})`;
    image.style.clipPath=`inset(${cropTop.toFixed(2)}px ${(box.width-cropLeft-cropWidth).toFixed(2)}px ${(box.height-cropTop-cropHeight).toFixed(2)}px ${cropLeft.toFixed(2)}px)`;
    image.dataset.cropReady='1';
  });
}
function renderFlatAcquire(){
  const rows=availableCourses;
  const exists=id=>activeMaterials().some(m=>m.sourceKey===id);
  const scheduled=id=>state.tasks.some(t=>t.sourceKey===id&&['queued','running','paused'].includes(t.status));
  main.innerHTML=`<div class="page-heading"><div><h1>获取课件</h1></div><span class="badge ${view.loggedIn?'exported':'pending'}">${view.loggedIn?'学校平台已连接':'尚未连接学校平台'}</span></div><div class="source-row"><section class="panel source-card"><div class="source-logo">${icon('school')}</div><div><h3>华工视频平台</h3><p class="${view.loggedIn?'connected':''}">${view.loggedIn?'学校平台已连接 · 凭据仅保存在本次运行中':'连接学校平台，按上课日期查找课件'}</p></div><button data-action="login" class="secondary">${view.loggedIn?'重新登录':'连接平台'}</button>${view.loggedIn?'<button class="quiet" data-action="logout">断开</button>':''}</section><section class="panel source-card"><div class="source-logo" style="background:#f2f1ed;color:#979481">${icon('folder')}</div><div><h3>本地资料</h3><p>图片、PDF 或课件目录</p></div><button data-action="import">导入 ${icon('plus')}</button></section></div>
    <section class="panel scan-panel"><div class="scan-bar"><label class="field">开始日期<input type="date" id="scan-start" value="${view.scanStart}"></label><label class="field">结束日期<input type="date" id="scan-end" value="${view.scanEnd}"></label><button class="primary" data-action="scan" ${!view.loggedIn||view.scanning?'disabled':''}>${icon('search')}${view.scanning?'正在扫描…':'立即重新扫描'}</button><span class="scan-note">登录或修改日期后自动扫描，也可手动强制刷新</span></div>
    ${view.scanning?empty('正在读取课表…','可以切换到其他页面，扫描会继续。'):state.scanError?empty('扫描失败',esc(state.scanError)):view.scanned?rows.length?`<div class="table-wrap"><table><thead><tr><th><input type="checkbox" id="scan-all" aria-label="选择所有可获取课件"></th><th>课程</th><th>上课日期</th><th>页数</th><th>资料状态</th></tr></thead><tbody>${rows.map(c=>`<tr><td><input type="checkbox" data-scan-select="${esc(c.id)}" aria-label="选择 ${esc(c.title)}" ${view.scanSelected.has(c.id)?'checked':''} ${exists(c.id)||scheduled(c.id)?'disabled':''}></td><td><div class="course-title">${esc(c.title)}</div><small>课次 ${esc(c.sub_id)}</small></td><td>${esc(c.day)}</td><td><small>获取后统计</small></td><td>${exists(c.id)?'<span class="badge exported">已在资料库</span>':scheduled(c.id)?'<span class="badge editing">获取中</span>':'<span class="badge pending">可获取</span>'}</td></tr>`).join('')}</tbody></table></div>`:empty('这个日期范围内没有课程','请选择实际有课的日期，或重新登录后再试。'):empty(view.loggedIn?'选择日期，开始查找课件':'连接平台后查找课件',view.loggedIn?'扫描结果会显示在这里。':'在学校网页中完成登录，课页会自动检测并开始扫描。')}
    <div class="scan-bottom"><span>已选择 <strong>${view.scanSelected.size}</strong> 节课</span><div class="actions"><label title="无需整理，下载完成后自动生成 PDF"><input type="checkbox" id="direct-export" ${view.directExport?'checked':''}>获取完成后自动导出 PDF</label><button class="primary" data-action="download" ${!view.scanSelected.size||view.scanning?'disabled':''}>${icon('download')}获取选中课件</button></div></div></section><div class="helper-note">${icon('info')}<span>整理不是导出的前置条件：可以下载后自动导出，也可以在课程页随时快速导出。<br>快速导出使用当前保留页面，保存到默认目录；原始页面始终保留。</span></div>`;
}
function renderTasks(){
  const tasks=state.tasks.filter(t=>view.taskFilter==='all'||(view.taskFilter==='active'?['queued','running','paused'].includes(t.status):view.taskFilter==='failed'?t.status==='failed':t.status==='done'));
  main.innerHTML=`<div class="page-heading"><div><h1>任务</h1></div><button data-nav="acquire">${icon('plus')}获取课件</button></div><div class="toolbar"><div class="tabs">${[['all','全部任务'],['active','进行中'],['done','已完成'],['failed','失败']].map(([id,label])=>`<button data-task-filter="${id}" class="${view.taskFilter===id?'active':''}">${label}</button>`).join('')}</div></div>${tasks.length?`<div class="task-list">${[...tasks].reverse().map(t=>`<article class="task-row"><div class="task-icon">${icon(t.type==='export'?'export':t.type==='scan'?'search':'download')}</div><div class="task-copy"><h3>${esc(t.title)}</h3><p>${{download:'下载',export:'导出',batch:'批量导出',import:'导入',scan:'扫描'}[t.type]} · ${{queued:'等待中',running:'正在处理',paused:'已暂停',done:'已完成',cancelled:'已取消',failed:'失败'}[t.status]}${['queued','running','paused'].includes(t.status)?` · ${t.progress}% · ${esc(t.message)}`:''}</p>${t.error?`<p class="task-error">${esc(t.error)}</p>`:''}${['queued','running','paused'].includes(t.status)?`<div class="task-progress"><span style="width:${t.progress}%"></span></div>`:''}</div><div class="actions">${['queued','running','paused'].includes(t.status)?`${t.type==='scan'?'':`<button data-task-toggle="${t.id}">${icon(t.status==='paused'?'play':'pause')}${t.status==='paused'?'继续':'暂停'}</button>`}<button data-task-cancel="${t.id}">取消</button>`:t.status==='done'?t.materialId?`<button data-open="${t.materialId}" ${!activeMaterials().some(m=>m.id===t.materialId)?'disabled':''}>打开课件 ${icon('arrow')}</button>${['export','batch'].includes(t.type)?`<button data-output="${t.materialId}">打开目录</button>`:''}`:'<button data-nav="acquire">查看课表</button>':t.type==='scan'?'<button data-nav="acquire">重新扫描</button>':`<button data-task-retry="${t.id}">重试</button>`}</div></article>`).join('')}</div>`:empty('暂无'+(view.taskFilter==='active'?'进行中的':'')+'任务','获取课件或导入本地文件后，任务记录会出现在这里。','<button class="primary" data-nav="acquire">前往获取课件</button>')}`;
}
function renderSettings(){
  const s=state.settings;
  main.innerHTML=`<div class="page-heading"><div><h1>设置</h1></div></div><div class="settings-grid"><div><section class="panel settings-section"><h2>资料库与存储</h2><div class="setting-row"><div><h3>资料库位置</h3><p>包含原始素材、预览和整理记录，可以整体备份。</p></div><div class="actions"><button data-action="open-library">打开目录</button><button data-action="choose-library">切换资料库</button></div></div><div class="setting-path">${esc(s.libraryDir)}</div><div class="setting-row"><div><h3>保留原始页面</h3><p>排除不删除图片；回收站中的课件可以恢复。</p></div><span class="badge exported">默认保留</span></div><div class="setting-row"><div><h3>自动保存整理进度</h3><p>页面选择写入本地资料库，重新打开可继续。</p></div><span class="badge exported">已开启</span></div></section><section class="panel settings-section"><h2>下载与导出</h2><div class="setting-row"><div><h3>获取课件后</h3><p>下一次获取课件的默认处理方式。</p></div><select id="default-export" class="field-input"><option value="review" ${s.exportMode==='review'?'selected':''}>先整理，再导出</option><option value="direct" ${s.exportMode==='direct'?'selected':''}>直接导出 PDF</option></select></div><div class="setting-row"><div><h3>默认 PDF 导出目录</h3><p>首次导出时选择并记住，也可在这里主动修改。</p></div><button data-action="choose-export-dir">选择目录</button></div><div class="setting-path ${s.exportDir?'':'unset-path'}">${s.exportDir?esc(s.exportDir):'尚未设置 · 首次导出时再选择'}</div><div class="settings-numbers">${[['maxWorkers','同时下载课件数',1,4],['timeout','请求超时（秒）',5,600],['retries','下载尝试次数',1,10],['sleepMs','请求间隔（毫秒）',0,5000]].map(([id,label,min,max])=>`<label class="field">${label}<input type="number" id="setting-${id}" min="${min}" max="${max}" value="${s[id]}"></label>`).join('')}</div><button class="secondary" data-action="save-settings">保存下载参数</button></section></div><aside class="guide-card">${icon('folder')}<h3 style="margin-top:16px">资料留在本机</h3><p>课页自动生成课程封面；实际页面预览来自下载的课件或导入文件。</p><hr><div class="number">${activeMaterials().length}<span style="font-size:12px;margin-left:8px">份课件</span></div><p>SQLite 保存整理记录<br>原始素材长期保留<br>PDF 单独导出</p><hr><p>切换资料库会打开另一个目录，不会移动或删除当前资料。备份时请先退出应用，再复制整个资料库目录。</p></aside></div>`;
}
function renderAbout(){
  main.innerHTML=`<section class="about-hero"><div class="about-mark"><img src="/app-icon.svg" alt="课页图标"></div><div class="about-intro"><div class="eyebrow">ABOUT KEYE</div><h1>课页 <span>KEYE</span></h1><p>把课堂课件的获取、筛选和 PDF 导出，整理成一条清楚、安静的工作流。</p><div class="about-actions"><span class="about-version">当前版本 v${esc(state.appVersion||'0.1.1')}</span><button class="secondary" data-action="show-help">${icon('help')}查看使用说明</button></div></div><div class="about-decoration" aria-hidden="true"><i></i><i></i><i></i></div></section>
    <div class="about-grid"><section class="panel about-card"><div class="about-card-icon">${icon('database')}</div><h2>资料留在本机</h2><p>课程、原始页面、筛选记录和设置保存在本地资料库中。排除页面不会删除原始素材。</p></section><section class="panel about-card"><div class="about-card-icon">${icon('school')}</div><h2>服务课堂资料</h2><p>面向华南理工大学课堂课件平台，也支持导入已有图片、PDF 和课件目录。</p></section><section class="panel about-card"><div class="about-card-icon">${icon('export')}</div><h2>自由整理与导出</h2><p>可以直接快速导出，也可以逐页预览、排除无关画面，再生成更干净的 PDF。</p></section></div>
    <div class="about-maintenance"><section class="panel about-update"><div class="about-maintenance-head"><div class="about-update-icon">${icon('download')}</div><div><div class="eyebrow">UPDATE</div><h2>更新与安装</h2></div></div><div class="about-update-copy"><p id="update-status" role="status"></p><div id="update-notes"></div><div class="update-meter" id="update-meter" hidden><span id="update-meter-fill"></span></div></div><div class="about-update-actions"><button data-action="check-update" ${state.packaged?'':'disabled'}>检查更新</button><button class="secondary" data-action="download-update" hidden>下载更新</button><button class="primary" data-action="install-update" hidden>重启并安装</button><button class="quiet" data-action="open-release">查看正式版本 ${icon('arrow')}</button></div></section>
    <section class="panel about-uninstall"><div class="about-maintenance-head"><div class="about-uninstall-icon">${icon('settings')}</div><div><div class="eyebrow">UNINSTALL</div><h2>卸载应用</h2></div></div><p>卸载向导可选择保留或删除默认应用数据。单独选定的资料库目录及已导出的 PDF 不会随程序卸载。</p><div class="about-uninstall-actions"><button class="secondary" data-action="uninstall" ${state.packaged?'':'disabled'}>打开卸载向导</button></div></section></div>
    <section class="panel about-details"><div><div class="eyebrow">PROJECT INFORMATION</div><h2>项目与作者</h2><p class="about-details-intro">课页是一个开源的个人课件整理工具，欢迎查看源码与后续更新。</p></div><dl><div><dt>应用名称</dt><dd>课页 · Keye</dd></div><div><dt>当前版本</dt><dd>v${esc(state.appVersion||'0.1.1')}</dd></div><div><dt>作者</dt><dd><button class="about-link" data-action="open-author">goooseby ${icon('arrow')}</button></dd></div><div><dt>项目仓库</dt><dd><button class="about-link" data-action="open-repository">goooseby/keye-desktop ${icon('arrow')}</button></dd></div></dl><p class="about-note">适用于 Windows 10 / 11。账号凭据仅在当前运行中使用，不会写入课件数据库。</p></section>`;
  renderUpdateStatus();
}
function renderUpdateStatus(){
  const status=$('#update-status');if(!status)return;
  const info=updateState.info;
  status.textContent=updateState.error||(!state.packaged?'源码运行中；安装与自动更新仅适用于安装版。':updateState.checking?'正在检查 GitHub Releases…':updateState.downloading?`正在下载并校验更新${updateState.progress?`：${updateState.progress}%`:'…'}`:updateState.ready?'下载和校验已完成，可以安装更新。':info?.manual?info.manualReason||'请在 GitHub 下载完整包。':info?.available?`发现 v${info.latest} · 完整更新${info.size?` · ${(info.size/1024/1024).toFixed(1)} MB`:''}`:info?'当前已是最新正式版本。':'点击检查更新，课页会从 GitHub 获取最新正式版本。');
  const notes=$('#update-notes');
  notes.textContent=info?.available&&info.notes?info.notes:'';
  notes.hidden=!notes.textContent;
  const meter=$('#update-meter');meter.hidden=!updateState.downloading;
  $('#update-meter-fill').style.width=updateState.progress+'%';
  $('[data-action="check-update"]').disabled=!state.packaged||updateState.checking||updateState.downloading;
  $('[data-action="download-update"]').hidden=!(info?.available&&!info.manual&&!updateState.downloading&&!updateState.ready);
  $('[data-action="install-update"]').hidden=!updateState.ready;
}
function showModal(title,body,actions=''){
  modal.classList.remove('fullscreen-modal');$('#modal-content').innerHTML=`<div class="modal-header"><h2>${title}</h2><button class="icon-button" data-action="close-modal" aria-label="关闭">${icon('close')}</button></div><div class="modal-body">${body}</div>${actions?`<div class="modal-actions">${actions}</div>`:''}`;if(!modal.open)modal.showModal();
}
function closeModal(){modal.close();modal.classList.remove('fullscreen-modal');}
function openMaterial(id){if(!activeMaterials().some(m=>m.id===id))return toast('请先从回收站恢复课件。');navigate('editor/'+id);}
async function commitPageState(excluded,crops,message,clearSelection=false){
  const m=material(),before={excluded:[...m.excluded],crops:JSON.parse(JSON.stringify(cropsOf(m)))};
  if(JSON.stringify(before.excluded)===JSON.stringify(excluded)&&JSON.stringify(before.crops)===JSON.stringify(crops))return false;
  const fullscreenOpen=modal.open&&modal.classList.contains('fullscreen-modal');
  view.saving=true;if(!fullscreenOpen)renderEditor();
  try{
    await call('pageState',{id:m.id,excluded,crops,revision:m.revision});
    if(view.materialId===m.id)view.undo.push(before);
    if(clearSelection){view.selected.clear();view.selectionAnchor=null;}
    if(message)toast(message);else flashCropSaved();
  }
  finally{view.saving=false;if(fullscreenOpen)scheduleFullscreen();else render();}
  return true;
}
async function mutatePages(pages,exclude){
  if(view.saving)return toast('正在保存上次修改，请稍候。');
  const m=material(),set=new Set(m.excluded);
  pages.forEach(p=>exclude?set.add(p):set.delete(p));
  await commitPageState([...set].sort((a,b)=>a-b),cropsOf(m),exclude?'已排除所选页面，原始素材仍保留':'所选页面已恢复',true);
}
async function commitCrop(crops,message){
  if(view.saving)return toast('正在保存上次修改，请稍候。');
  return commitPageState([...material().excluded],crops,message);
}
async function applyCrop(rect,message){
  const m=material(),crops={...cropsOf(m)};
  if(rect)crops[String(view.currentPage)]=rect;else delete crops[String(view.currentPage)];
  await commitCrop(crops,message);
}
async function undo(){
  if(view.saving||!view.undo.length)return;
  const m=material(),snapshot=view.undo[view.undo.length-1],fullscreenOpen=modal.open&&modal.classList.contains('fullscreen-modal');view.saving=true;
  try{await call('pageState',{id:m.id,excluded:snapshot.excluded,crops:snapshot.crops||{},revision:m.revision});view.undo.pop();view.selected.clear();toast('已撤销上次页面操作');}
  finally{view.saving=false;if(fullscreenOpen)scheduleFullscreen();else render();}
}
function updateEditorPreview(){
  const m=material(),panel=document.querySelector('.preview-panel');
  if(!m||!panel)return renderEditor();
  document.querySelectorAll('[data-page-tile].current').forEach(tile=>tile.classList.remove('current'));
  document.querySelector(`[data-page-tile="${view.currentPage}"]`)?.classList.add('current');
  panel.querySelector('.preview-title span').textContent=`原始页 ${view.currentPage} / ${m.pages}`;
  const stage=panel.querySelector('.large-art'),image=stage.querySelector('img.slide'),media=m.media?.[view.currentPage-1];
  if(media&&image&&image.src!==media.src){
    const request=++editorImageRequest,page=view.currentPage,loader=new Image();
    stage.setAttribute('aria-busy','true');loader.decoding='async';loader.src=media.src;
    const commit=()=>{if(request!==editorImageRequest||view.currentPage!==page||!image.isConnected)return;image.src=media.src;image.alt=`${m.title} · 第 ${page} 页`;stage.removeAttribute('aria-busy');syncImageCrop(image,material(),view.currentPage);applyCropViews();};
    if(loader.decode)loader.decode().then(commit).catch(commit);else loader.onload=commit;
  }else if(media&&image){++editorImageRequest;stage.removeAttribute('aria-busy');}
  else stage.innerHTML=slide(m,view.currentPage);
  syncImageCrop(image,m,view.currentPage);
  const controls=panel.querySelector('.preview-controls'),buttons=controls.querySelectorAll('button');
  buttons[0].disabled=stepTarget(-1)===null;controls.querySelector('span').textContent=`第 ${view.currentPage} 页`;buttons[1].disabled=stepTarget(1)===null;
  panel.querySelector('.preview-detail').innerHTML=previewDetailHtml(m,view.currentPage);
  applyCropViews();
  fullscreenPreloads=[view.currentPage-1,view.currentPage+1].map(page=>m.media?.[page-1]?.src).filter(Boolean).map(src=>{const preload=new Image();preload.src=src;return preload;});
}
function preview(page){
  const m=material();view.currentPage=Math.max(1,Math.min(m.pages,page));m.lastPage=view.currentPage;
  pendingLastPage={id:m.id,page:view.currentPage};clearTimeout(lastPageTimer);
  lastPageTimer=setTimeout(()=>{const latest=pendingLastPage;pendingLastPage=null;if(latest)call('lastPage',latest).catch(fail);},240);
  if(modal.open&&modal.classList.contains('fullscreen-modal'))scheduleFullscreen();else updateEditorPreview();
}
function stepPage(step){const target=stepTarget(step);if(target!==null)preview(target);}
function scheduleFullscreen(){
  if(fullscreenFrame!==null)return;
  fullscreenFrame=requestAnimationFrame(()=>{fullscreenFrame=null;if(modal.open&&modal.classList.contains('fullscreen-modal'))showFullscreen();});
}
function showFullscreen(){
  const m=material(),excluded=m.excluded.includes(view.currentPage),media=m.media?.[view.currentPage-1];
  const updating=modal.open&&modal.classList.contains('fullscreen-modal')&&$('#fullscreen-stage');
  if(updating){
    $('#fullscreen-title').textContent=`${m.title} · 第 ${view.currentPage} 页`;
    const stage=$('#fullscreen-stage'),image=stage.querySelector('img.slide');
    if(media&&image&&image.src!==media.src){
      const request=++fullscreenImageRequest,page=view.currentPage,loader=new Image();
      stage.setAttribute('aria-busy','true');loader.decoding='async';loader.src=media.src;
      const commit=()=>{if(request!==fullscreenImageRequest||view.currentPage!==page||!image.isConnected)return;image.src=media.src;image.alt=`${m.title} · 第 ${page} 页`;stage.removeAttribute('aria-busy');syncImageCrop(image,material(),view.currentPage);applyCropViews();layoutCropLayer();};
      if(loader.decode)loader.decode().then(commit).catch(commit);else loader.onload=commit;
    }else if(media&&image){++fullscreenImageRequest;stage.removeAttribute('aria-busy');}
    else if(!view.crop)stage.innerHTML=slide(m,view.currentPage);
    if(!view.crop)syncImageCrop(stage.querySelector('img.slide'),m,view.currentPage);
  }else{
    modal.classList.add('fullscreen-modal');
    $('#modal-content').innerHTML=`<div class="modal-header"><h2 id="fullscreen-title">${esc(m.title)} · 第 ${view.currentPage} 页</h2><div class="fullscreen-shortcuts" id="fullscreen-shortcuts" data-signature="${view.crop?1:0}">${fullscreenShortcutsHtml()}</div><button class="icon-button" data-action="close-modal" aria-label="关闭">${icon('close')}</button></div><div class="modal-body"><div id="fullscreen-stage">${stageHtml(m)}</div><div class="full-nav${view.crop?' cropping':''}" data-signature="">${fullNavHtml(m)}</div></div>`;
    modal.showModal();
    if(view.crop)fillCropLayer();
  }
  syncFullscreenChrome();
  requestAnimationFrame(()=>{applyCropViews();layoutCropLayer();});
  fullscreenPreloads=[view.currentPage-1,view.currentPage+1].map(page=>m.media?.[page-1]?.src).filter(Boolean).map(src=>{const image=new Image();image.src=src;return image;});
}
function stageHtml(m){
  return view.crop?`${slide(m,view.currentPage,false,true)}<div class="crop-layer" id="crop-layer"></div>`:slide(m,view.currentPage);
}
function cropFrame(m){const crop=cropOf(m,view.currentPage);return crop?{page:view.currentPage,x:crop[0],y:crop[1],w:crop[2],h:crop[3]}:{page:view.currentPage,...fullCrop()};}
function cropFrameChanged(){
  const crop=view.crop;if(!crop)return false;
  return crop.x>0.001||crop.y>0.001||crop.w<0.999||crop.h<0.999;
}
const isFullCrop=rect=>!!rect&&rect[0]<=0.0005&&rect[1]<=0.0005&&rect[2]>=0.9995&&rect[3]>=0.9995;
// 浏览态只留浏览该有的动作；进入裁剪模式后一次给全，位置不再变动。
function cropToolsHtml(m){
  const crop=cropOf(m,view.currentPage),cropping=!!view.crop,actionable=cropping?(cropFrameChanged()||!!crop):!!crop,parts=[];
  parts.push(`<button data-action="crop-toggle" class="${cropping?'primary':''}">${icon('crop')}${cropping?'完成裁剪':'裁剪'}</button>`);
  if(cropping){
    parts.push(`<button data-action="crop-reset" ${actionable?'':'disabled'}>还原裁剪</button>`);
    parts.push(`<button data-action="crop-all" ${actionable?'':'disabled'} title="把当前页的裁剪应用到本课所有页">应用到全部页</button>`);
    parts.push(`<button data-action="crop-selected" ${actionable&&view.selected.size?'':'disabled'}>应用到选中 ${view.selected.size} 页</button>`);
    parts.push('<span class="crop-readout" id="crop-readout"></span>');
  }else if(crop){
    parts.push('<button data-action="crop-reset">还原裁剪</button>');
  }
  return parts.join('');
}
function fullNavHtml(m){
  const tools=`<div class="nav-crop" id="fullscreen-crop-tools">${cropToolsHtml(m)}</div>`;
  if(view.crop)return tools; // 裁剪模式：整行只属于裁剪，翻页与排除退出舞台
  return `${tools}<div class="nav-pager"><button data-action="previous" ${stepTarget(-1)===null?'disabled':''}>${icon('left')}上一页</button><span id="fullscreen-page">${view.currentPage} / ${m.pages}</span><button data-action="next" ${stepTarget(1)===null?'disabled':''}>下一页${icon('right')}</button></div><button class="nav-exclude" data-action="toggle-fullscreen-page">${m.excluded.includes(view.currentPage)?'恢复此页':'排除此页'}</button>`;
}
function fullscreenShortcutsHtml(){
  const hint='<span id="fullscreen-nav-hint"></span>';
  return view.crop?hint:`${hint}<span><kbd>E</kbd> 排除 / 恢复</span><span><kbd>C</kbd> 裁剪</span>`;
}
function syncFullscreenChrome(){
  const m=material();if(!m)return;
  if(view.crop&&view.crop.page!==view.currentPage&&!cropGesture)view.crop=cropFrame(m);
  const shortcuts=$('#fullscreen-shortcuts');
  if(shortcuts){
    const mode=view.crop?1:0;
    if(shortcuts.dataset.signature!==String(mode)){shortcuts.dataset.signature=String(mode);shortcuts.innerHTML=fullscreenShortcutsHtml();}
  }
  const hint=$('#fullscreen-nav-hint');
  if(hint)hint.innerHTML=view.crop?'<kbd>方向键</kbd> 微调裁剪框　<kbd>Enter</kbd> 完成':`<kbd>←</kbd> <kbd>→</kbd> 翻页${view.pageFilter==='kept'?'（跳过已排除页）':''}`;
  const nav=$('.full-nav');
  if(nav){
    const signature=[view.crop?1:0,view.currentPage,m.pages,view.selected.size,cropOf(m,view.currentPage)?1:0,cropFrameChanged()?1:0,m.excluded.includes(view.currentPage)?1:0,stepTarget(-1)===null?1:0,stepTarget(1)===null?1:0].join('|');
    if(nav.dataset.signature!==signature){nav.dataset.signature=signature;nav.classList.toggle('cropping',!!view.crop);nav.innerHTML=fullNavHtml(m);}
  }
  updateCropReadout();layoutCropLayer();
}
function toggleCropMode(){
  if(view.crop)return exitCropMode();
  const m=material();if(!m)return;
  view.crop=cropFrame(m);rebuildFullscreenStage();syncFullscreenChrome();
}
function exitCropMode(){view.crop=null;rebuildFullscreenStage();syncFullscreenChrome();}
function rebuildFullscreenStage(){
  const m=material(),stage=$('#fullscreen-stage');if(!m||!stage)return;
  stage.innerHTML=stageHtml(m);
  if(view.crop)fillCropLayer();
  applyCropViews();
  requestAnimationFrame(()=>{applyCropViews();layoutCropLayer();});
}
function fillCropLayer(){
  const layer=$('#crop-layer');if(!layer)return;
  layer.innerHTML=`<div class="crop-box" id="crop-box">${['nw','n','ne','e','se','s','sw','w'].map(handle=>`<i class="crop-handle" data-handle="${handle}"></i>`).join('')}</div>`;
  paintCropBox();
}
function paintCropBox(){
  const box=$('#crop-box');if(!box||!view.crop)return;
  const {x,y,w,h}=view.crop;
  box.style.left=`${x*100}%`;box.style.top=`${y*100}%`;box.style.width=`${w*100}%`;box.style.height=`${h*100}%`;
}
function layoutCropLayer(){
  const stage=$('#fullscreen-stage'),image=stage?.querySelector('img.slide'),layer=stage?.querySelector('.crop-layer');
  if(!stage||!image||!layer)return;
  const bitmap=pageBitmapRect(image);
  if(!bitmap){layer.style.display='none';return;}
  const box=stage.getBoundingClientRect();
  layer.style.display='block';
  layer.style.left=`${bitmap.left-box.left}px`;layer.style.top=`${bitmap.top-box.top}px`;
  layer.style.width=`${bitmap.width}px`;layer.style.height=`${bitmap.height}px`;
  paintCropBox();
}
function ratioLabel(width,height){
  if(!width||!height)return'';
  const gcd=(a,b)=>b?gcd(b,a%b):a;
  const divisor=gcd(Math.round(width),Math.round(height));
  const left=Math.round(width)/divisor,right=Math.round(height)/divisor;
  return left<=60&&right<=60?`${left}:${right}`:`${(width/height).toFixed(2)}:1`;
}
function updateCropReadout(){
  const readout=$('#crop-readout');if(!readout)return;
  if(!view.crop){readout.textContent=cropOf(material(),view.currentPage)?'此页已裁剪 · 导出使用裁剪后的画面':'';return;}
  const image=$('#fullscreen-stage img.slide'),iw=image?.naturalWidth||0,ih=image?.naturalHeight||0;
  const {x,y,w,h}=view.crop;
  const size=iw?` · ${Math.round(iw*w)}×${Math.round(ih*h)} ${ratioLabel(iw*w,ih*h)}`:'';
  readout.textContent=`裁剪范围 ${Math.round(w*100)}% × ${Math.round(h*100)}%${size}${cropSavedAt?' · 已保存':''}`;
}
function flashCropSaved(){
  if(!view.crop)return;
  cropSavedAt=true;updateCropReadout();
  clearTimeout(cropSavedTimer);cropSavedTimer=setTimeout(()=>{cropSavedAt=false;updateCropReadout();},1400);
}
function cropRectValue(){const crop=view.crop;return crop?[round6(crop.x),round6(crop.y),round6(crop.w),round6(crop.h)]:null;}
// 拉满整页等于没有裁剪，避免存下一份没有意义的整页矩形。
function commitCropFrame(message){const rect=cropRectValue();return applyCrop(isFullCrop(rect)?null:rect,message||'');}
function toNorm(event,layer){const box=layer.getBoundingClientRect();return {x:(event.clientX-box.left)/box.width,y:(event.clientY-box.top)/box.height};}
function clampCrop(rect,layer,snap=true){
  const box=layer.getBoundingClientRect(),minWidth=20/box.width,minHeight=20/box.height,snapX=8/box.width,snapY=8/box.height;
  let {x,y,w,h}=rect;
  w=Math.max(minWidth,Math.min(1,w));h=Math.max(minHeight,Math.min(1,h));
  x=Math.max(0,Math.min(1-w,x));y=Math.max(0,Math.min(1-h,y));
  if(snap){ // 键盘微调不做吸附，保证每次按键都真的动 1px
    if(x<snapX)x=0;else if(x+w>1-snapX)w=1-x;
    if(y<snapY)y=0;else if(y+h>1-snapY)h=1-y;
  }
  return {x,y,w,h};
}
function resizeCrop(origin,handle,point){
  let {x,y,w,h}=origin;const right=x+w,bottom=y+h;
  if(handle.includes('w')){x=Math.min(point.x,right);w=right-x;}
  if(handle.includes('e')){w=Math.max(point.x,x)-x;}
  if(handle.includes('n')){y=Math.min(point.y,bottom);h=bottom-y;}
  if(handle.includes('s')){h=Math.max(point.y,y)-y;}
  return {x,y,w,h};
}
async function resetCrop(){
  const m=material();
  if(view.crop){view.crop={page:view.currentPage,...fullCrop()};paintCropBox();updateCropReadout();layoutCropLayer();}
  const crops={...cropsOf(m)};delete crops[String(view.currentPage)];
  await commitCrop(crops,cropOf(m,view.currentPage)?'已还原为整页':'');
}
async function applyCropToAll(){
  const m=material(),rect=cropOf(m,view.currentPage);
  if(!rect)return toast('请先裁剪当前页，再应用到其他页。');
  const crops={...cropsOf(m)};
  for(let page=1;page<=m.pages;page++)crops[String(page)]=rect;
  await commitCrop(crops,`已将当前裁剪应用到全部 ${m.pages} 页`);
}
async function applyCropToSelected(){
  const m=material(),rect=cropOf(m,view.currentPage),pages=[...view.selected].sort((a,b)=>a-b);
  if(!rect)return toast('请先裁剪当前页，再应用到选中的页面。');
  if(!pages.length)return toast('请先在网格里勾选页面。');
  const crops={...cropsOf(m)};
  pages.forEach(page=>crops[String(page)]=rect);
  await commitCrop(crops,`已将当前裁剪应用到选中的 ${pages.length} 页`);
}
document.addEventListener('pointerdown',event=>{
  const layer=event.target.closest?.('#crop-layer');
  if(!layer||!view.crop||view.saving||event.button!==0)return;
  const point=toNorm(event,layer),crop=view.crop;
  const inside=point.x>=crop.x&&point.x<=crop.x+crop.w&&point.y>=crop.y&&point.y<=crop.y+crop.h;
  const handle=event.target.dataset?.handle||'';
  cropGesture={mode:handle?'resize':inside?'move':'new',handle,start:point,origin:{x:crop.x,y:crop.y,w:crop.w,h:crop.h},moved:false};
  try{layer.setPointerCapture(event.pointerId);}catch{}
  event.preventDefault();
});
document.addEventListener('pointermove',event=>{
  const layer=$('#crop-layer');
  if(!cropGesture||!layer||!view.crop)return;
  const point=toNorm(event,layer),gesture=cropGesture;
  let next;
  if(gesture.mode==='new'){const x=Math.min(gesture.start.x,point.x),y=Math.min(gesture.start.y,point.y);next={x,y,w:Math.abs(point.x-gesture.start.x),h:Math.abs(point.y-gesture.start.y)};}
  else if(gesture.mode==='move')next={x:gesture.origin.x+(point.x-gesture.start.x),y:gesture.origin.y+(point.y-gesture.start.y),w:gesture.origin.w,h:gesture.origin.h};
  else next=resizeCrop(gesture.origin,gesture.handle,point);
  gesture.raw=next;gesture.moved=true;
  view.crop={page:view.currentPage,...clampCrop(next,layer)};
  paintCropBox();updateCropReadout();
});
document.addEventListener('pointerup',()=>{
  const gesture=cropGesture;if(!gesture)return;
  cropGesture=null;
  const layer=$('#crop-layer');if(!layer||!view.crop)return;
  const box=layer.getBoundingClientRect(),raw=gesture.raw;
  if(!gesture.moved||(gesture.mode==='new'&&(!raw||raw.w*box.width<8||raw.h*box.height<8))){
    view.crop={page:view.currentPage,...gesture.origin};paintCropBox();updateCropReadout();return;
  }
  commitCropFrame().catch(fail);
});
function showExport(){
  const m=material(),kept=m.pages-m.excluded.length,croppedKept=cropCount(m,true);if(!kept||view.saving)return;
  showModal('导出 PDF',`<p>将按原始页序，合并当前保留的页面；已裁剪的页面按裁剪后的画面导出。导出期间继续修改，不会影响本次输出。</p><div class="modal-stat"><div><strong>${m.pages}</strong><span>原始页面</span></div><div><strong>${kept}</strong><span>保留并导出</span></div><div><strong>${m.excluded.length}</strong><span>已排除</span></div>${croppedKept?`<div><strong>${croppedKept}</strong><span>已裁剪</span></div>`:''}</div><label class="field">文件名称<input type="text" id="export-name" value="${esc(m.day+'_'+m.title+'.pdf')}" maxlength="120"></label><p>下一步选择文件保存位置，完成后可在任务页打开输出目录。</p>`, '<button data-action="close-modal">取消</button><button class="primary" data-action="confirm-export">选择位置并导出</button>');
}
function showHelp(){showModal('欢迎使用课页',`<ol class="help-steps"><li>获取课件 → 连接平台，完成学校登录。</li><li>扫描实际有课的日期，选择课程并获取。</li><li>资料库 → 打开课件，筛选需要保留的页面。</li><li>导出 PDF，选择保存位置。</li><li>下次打开课页，继续之前的整理。</li></ol><p>也可以导入本地图片、PDF 或课件目录。封面由课页自动生成，预览展示真实页面。方向键翻页，E 排除/恢复，Ctrl+Z 撤销。</p><p>双击缩略图放大后可以裁剪页面：拖动画出需要的部分，导出会使用裁剪后的画面，原始图片和画面始终保留，随时可以还原。</p>`, '<button class="primary" data-action="close-modal">开始使用</button>');}

document.addEventListener('click',event=>{
  if(event.target.matches?.('[data-page-check]'))view.pageShiftPending=event.shiftKey;
  handleClick(event).then(()=>{
    if(view.sessionMenuId&&!event.target.closest('.session-actions')){view.sessionMenuId=null;if(view.page==='course')renderCourse();}
  }).catch(fail);
});
async function handleClick(event){
  const b=event.target.closest('button,a,[data-action],[data-course-session]');if(b?.disabled)return;
  if(await courseClick(b))return;
  if(b?.dataset.nav)return navigate(b.dataset.nav);
  if(b?.dataset.open)return openMaterial(b.dataset.open);
  if(b?.dataset.output)return call('openExport',{id:b.dataset.output});
  if(b?.dataset.filter){view.filter=b.dataset.filter;renderLibrary();return;}
  if(b?.dataset.pageFilter){view.pageFilter=b.dataset.pageFilter;view.selected.clear();view.selectionAnchor=null;renderEditor();return;}
  if(b?.dataset.taskFilter){view.taskFilter=b.dataset.taskFilter;renderTasks();return;}
  if(b?.dataset.restore){await call('trash',{id:b.dataset.restore,deleted:false});toast('课件已恢复');return;}
  if(b?.dataset.togglePage){const p=Number(b.dataset.togglePage);return mutatePages([p],!material().excluded.includes(p));}
  for(const [attr,action] of [['taskToggle','toggle'],['taskCancel','cancel'],['taskRetry','retry']])if(b?.dataset[attr])return call('task',{id:b.dataset[attr],action});
  if(b?.dataset.menu){const m=state.materials.find(m=>m.id===b.dataset.menu);return showModal('管理课件',`<p>${esc(m.title)} · ${esc(m.day)}</p><p>移入回收站后可恢复，原始素材和筛选记录都会保留。已经导出的文件不受影响。</p>`,`<button data-action="close-modal">取消</button><button class="danger" data-delete-material="${m.id}">移入回收站</button>`);}
  if(b?.dataset.deleteMaterial){await call('trash',{id:b.dataset.deleteMaterial,deleted:true});closeModal();toast('已移入回收站');return;}
  const page=event.target.closest('[data-preview]');
  if(page){clearTimeout(preview.timer);preview.timer=setTimeout(()=>preview(Number(page.dataset.preview)),220);return;}
  const action=b?.dataset.action;if(!action)return;
  if(action==='close-modal')return closeModal();
  if(action==='clear-search'){view.search='';renderLibrary();return;}
  if(action==='login'){await call('login');return;}
  if(['login-home','login-reload','login-check'].includes(action)){
    const found=await call('loginControl',{action:action.slice(6)});
    if(action==='login-check'&&!found)toast('尚未检测到完整登录状态，请继续在网页操作。');
    return;
  }
  if(action==='logout')return call('logout');
  if(action==='scan'){
    clearTimeout(autoScanTimer);
    autoScanRequested=false;
    const start=$('#scan-start').value,end=$('#scan-end').value;
    if(!start||!end||start>end)return toast('请填写有效日期，开始日期不能晚于结束日期。');
    view.scanStart=start;view.scanEnd=end;view.scanSelected.clear();return call('scan',{start,end});
  }
  if(action==='download'){const ids=[...view.scanSelected];if(await call('download',{ids,direct:view.directExport})){view.scanSelected.clear();navigate('tasks');toast('已将选中课件全部加入任务队列');}return;}
  if(action==='import'){view.importCourseId=view.page==='course'&&view.courseId!=='unfiled'?view.courseId:null;return showModal('导入本地资料',`<p>复制文件到资料库，保留源文件。多张图片合为一份课件，多个 PDF 分别导入。</p><p>选择课件目录时，会按图片文件夹分组；同一课次同时有图片和 PDF 时优先导入图片。</p>`, '<button data-action="close-modal">取消</button><button data-action="import-folder">选择目录</button><button class="primary" data-action="import-files">选择 PDF / 图片</button>');}
  if(action==='import-folder'||action==='import-files'){
    if(view.importChoosing)return toast('文件选择窗口已打开，请先完成选择。');
    view.importChoosing=true;closeModal();toast('正在打开文件选择窗口…');
    try{const added=await call('import',{kind:action==='import-folder'?'folder':'files',courseId:view.importCourseId});if(added){navigate('tasks');toast('已开始导入；进度显示在任务页。');}}
    finally{view.importChoosing=false;}
    return;
  }
  if(action==='select-all-pages'){
    const m=material(),pages=Array.from({length:m.pages},(_,i)=>i+1).filter(p=>view.pageFilter==='all'||!m.excluded.includes(p));view.selected=view.selected.size===pages.length?new Set():new Set(pages);view.selectionAnchor=null;syncSelectionUi();return;
  }
  if(action==='range')return showModal('选择连续页面',`<p>使用原始页码选择，再批量排除或恢复。</p><div class="range-fields"><label class="field">从第几页<input type="number" id="range-from" min="1" max="${material().pages}" value="${view.currentPage}"></label><label class="field">到第几页<input type="number" id="range-to" min="1" max="${material().pages}" value="${Math.min(material().pages,view.currentPage+3)}"></label></div>`, '<button data-action="close-modal">取消</button><button class="primary" data-action="confirm-range">选中这些页面</button>');
  if(action==='confirm-range'){const from=Number($('#range-from').value),to=Number($('#range-to').value);if(!Number.isInteger(from)||!Number.isInteger(to)||from<1||to>material().pages||from>to)return toast('请输入有效的页面范围。');view.pageFilter='all';view.selected=new Set(Array.from({length:to-from+1},(_,i)=>i+from));view.selectionAnchor=to;closeModal();renderEditor();return;}
  if(action==='exclude')return mutatePages([...view.selected],true);
  if(action==='restore')return mutatePages([...view.selected],false);
  if(action==='undo')return undo();
  if(action==='previous')return stepPage(-1);
  if(action==='next')return stepPage(1);
  if(action==='fullscreen')return showFullscreen();
  if(action==='toggle-fullscreen-page'){await mutatePages([view.currentPage],!material().excluded.includes(view.currentPage));return;}
  if(action==='crop-toggle')return toggleCropMode();
  if(action==='crop-reset')return resetCrop();
  if(action==='crop-all')return applyCropToAll();
  if(action==='crop-selected')return applyCropToSelected();
  if(action==='export')return showExport();
  if(action==='quick-export'){await submitExport('quickExport',{id:material().id},'PDF 导出完成，可在任务页打开输出目录。');return;}
  if(action==='confirm-export'){const id=material().id,name=$('#export-name').value.trim();if(!name)return toast('请填写文件名。');closeModal();await submitExport('export',{id,name},'PDF 导出完成，可在任务页打开输出目录。');return;}
  if(action==='open-library')return call('openLibrary');
  if(action==='show-help')return showHelp();
  if(action==='check-update'){
    updateState.checking=true;updateState.info=null;updateState.ready=false;updateState.error='';renderUpdateStatus();
    try{updateState.info=await call('checkUpdate');}
    catch(error){updateState.error=error.message;}
    finally{updateState.checking=false;renderUpdateStatus();}
    return;
  }
  if(action==='download-update'){
    updateState.downloading=true;updateState.progress=0;updateState.error='';renderUpdateStatus();
    try{await call('downloadUpdate');updateState.ready=true;}
    catch(error){updateState.error=error.message;}
    finally{updateState.downloading=false;renderUpdateStatus();}
    return;
  }
  if(action==='install-update')return call('installUpdate');
  if(action==='open-release')return call('openRelease');
  if(action==='open-author')return call('openAuthor');
  if(action==='open-repository')return call('openRepository');
  if(action==='uninstall')return call('uninstall');
  if(action==='choose-export-dir')return call('chooseExportDir');
  if(action==='choose-library')return showModal('切换资料库', '<p>选择一个新的空目录，或打开以前的资料库。当前资料会保留在原目录，不会自动搬迁。</p><p>请等待后台任务完成后再切换。</p>', '<button data-action="close-modal">取消</button><button class="primary" data-action="confirm-library">选择资料库目录</button>');
  if(action==='confirm-library'){closeModal();if(await call('chooseLibrary')){view.materialId=null;view.undo=[];view.filter='all';view.search='';navigate('library');}return;}
  if(action==='save-settings'){const values={};for(const k of ['maxWorkers','timeout','retries','sleepMs'])values[k]=Number($('#setting-'+k).value);await call('settings',values);toast('下载参数已保存');}
}
document.addEventListener('change',event=>{handleChange(event).catch(fail);});
async function handleChange(event){
  const el=event.target;
  if(courseChange(el))return;
  if(el.matches('[data-page-check]')){
    const p=Number(el.dataset.pageCheck),checked=el.checked;
    if(view.pageShiftPending&&view.selectionAnchor!==null){
      const from=Math.min(view.selectionAnchor,p),to=Math.max(view.selectionAnchor,p),m=material();
      for(let page=from;page<=to;page++){
        if(view.pageFilter==='all'||!m.excluded.includes(page))checked?view.selected.add(page):view.selected.delete(page);
      }
    }else checked?view.selected.add(p):view.selected.delete(p);
    view.selectionAnchor=p;view.pageShiftPending=false;syncSelectionUi();
  }
  if(el.matches('[data-scan-select]')){el.checked?view.scanSelected.add(el.dataset.scanSelect):view.scanSelected.delete(el.dataset.scanSelect);renderAcquire();}
  if(el.id==='scan-all'){availableCourses.filter(c=>!activeMaterials().some(m=>m.sourceKey===c.id)&&!state.tasks.some(t=>t.sourceKey===c.id&&['queued','running','paused'].includes(t.status))).forEach(c=>el.checked?view.scanSelected.add(c.id):view.scanSelected.delete(c.id));renderAcquire();}
  if(el.id==='library-sort'){view.sort=el.value;renderLibrary();}
  if(el.id==='direct-export')view.directExport=el.checked;
  if(el.id==='scan-start'){view.scanStart=el.value;scheduleAutoScan();}
  if(el.id==='scan-end'){view.scanEnd=el.value;scheduleAutoScan();}
  if(el.id==='default-export'){await call('settings',{exportMode:el.value});toast('默认获取方式已保存');}
}
function searchInput(event){if(event.target.id==='library-search'&&!event.isComposing){const cursor=event.target.selectionStart;view.search=event.target.value;renderLibrary();$('#library-search').focus();$('#library-search').setSelectionRange(cursor,cursor);}}
document.addEventListener('input',searchInput);document.addEventListener('compositionend',searchInput);
document.addEventListener('dblclick',event=>{const el=event.target.closest('[data-preview]');if(el){clearTimeout(preview.timer);view.currentPage=Number(el.dataset.preview);preview(view.currentPage);showFullscreen();}});
document.addEventListener('keydown',event=>{
  if(view.page!=='editor'||['INPUT','SELECT','TEXTAREA'].includes(event.target.tagName))return;
  if(event.key==='Enter'&&event.target.matches?.('[data-preview]')){view.currentPage=Number(event.target.dataset.preview);showFullscreen();return;}
  if(modal.open&&!modal.classList.contains('fullscreen-modal'))return;
  if(view.crop){
    if(event.key==='Escape'||event.key==='Enter'){event.preventDefault();return exitCropMode();}
    if(event.key.startsWith('Arrow')){
      event.preventDefault();
      const layer=$('#crop-layer'),box=layer?.getBoundingClientRect();if(!box)return;
      const step=event.shiftKey?10:1;
      const moveX=event.key==='ArrowLeft'?-step/box.width:event.key==='ArrowRight'?step/box.width:0;
      const moveY=event.key==='ArrowUp'?-step/box.height:event.key==='ArrowDown'?step/box.height:0;
      const crop=view.crop,next=clampCrop({x:crop.x+moveX,y:crop.y+moveY,w:crop.w,h:crop.h},layer,false);
      view.crop={page:view.currentPage,...next};paintCropBox();updateCropReadout();
      clearTimeout(cropNudgeTimer);cropNudgeTimer=setTimeout(()=>commitCropFrame().catch(fail),400);
      return;
    }
  }
  if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();stepPage(event.key==='ArrowLeft'?-1:1);}
  if(event.key.toLowerCase()==='e'&&!event.ctrlKey&&!event.metaKey&&!view.crop){mutatePages([view.currentPage],!material().excluded.includes(view.currentPage)).catch(fail);}
  if(event.key.toLowerCase()==='c'&&!event.ctrlKey&&!event.metaKey&&!view.crop){toggleCropMode();return;}
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){event.preventDefault();undo().then(()=>{if(modal.open)scheduleFullscreen();}).catch(fail);}
});
document.addEventListener('load',event=>{if(event.target?.matches?.('img.slide')){applyCropViews();layoutCropLayer();}},true);
window.addEventListener('resize',()=>{applyCropViews();layoutCropLayer();});
$('#help-button').addEventListener('click',showHelp);
modal.addEventListener('close',()=>{modal.classList.remove('fullscreen-modal');view.crop=null;cropGesture=null;if(view.page==='editor')renderEditor();});
window.addEventListener('hashchange',route);
main.innerHTML=empty('正在加载界面…','正在读取界面资源。');hydrate();
window.startKeye=()=>{
  main.innerHTML=empty('正在打开资料库…','正在读取本地课程与课件记录。');
  const loadingTimer=setTimeout(()=>{if(!ready)main.innerHTML=empty('资料库仍在加载…','如果持续较久，请检查项目内的开发资料库目录。');},12000);
  window.keyeListen('snapshot-changed',applySnapshot);
  window.keyeListen('task-changed',task=>{const index=state.tasks.findIndex(t=>t.id===task.id);if(index>=0)state.tasks[index]=task;else state.tasks.push(task);renderShell();if(view.page==='tasks')renderTasks();});
  window.keyeListen('notice',toast);
  window.addEventListener('keye-update-progress',event=>{updateState.progress=event.detail;renderUpdateStatus();});
  call('snapshot').then(snapshot=>{clearTimeout(loadingTimer);applySnapshot(snapshot);route();}).catch(error=>{clearTimeout(loadingTimer);main.innerHTML=empty('资料库打开失败',esc(error.message));});
};
