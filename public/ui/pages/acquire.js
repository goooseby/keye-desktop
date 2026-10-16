'use strict';

// 获取课件页：平台登录、课表扫描、选择与下载，以及本地导入。

let autoScanTimer=null;
let autoScanRequested=false;
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
function acquireMarkup(){
  const rows=availableCourses;
  const exists=id=>activeMaterials().some(m=>m.sourceKey===id);
  const scheduled=id=>state.tasks.some(t=>t.sourceKey===id&&['queued','running','paused'].includes(t.status));
  main.innerHTML=`<div class="page-heading"><div><h1>获取课件</h1></div><span class="badge ${view.loggedIn?'exported':'pending'}">${view.loggedIn?'学校平台已连接':'尚未连接学校平台'}</span></div><div class="source-row"><section class="panel source-card"><div class="source-logo">${icon('school')}</div><div><h3>华工视频平台</h3><p class="${view.loggedIn?'connected':''}">${view.loggedIn?'学校平台已连接 · 凭据仅保存在本次运行中':'连接学校平台，按上课日期查找课件'}</p></div><button data-action="login" class="secondary">${view.loggedIn?'重新登录':'连接平台'}</button>${view.loggedIn?'<button class="quiet" data-action="logout">断开</button>':''}</section><section class="panel source-card"><div class="source-logo" style="background:#f2f1ed;color:#979481">${icon('folder')}</div><div><h3>本地资料</h3><p>图片、PDF 或课件目录</p></div><button data-action="import">导入 ${icon('plus')}</button></section></div>
    <section class="panel scan-panel"><div class="scan-bar"><label class="field">开始日期<input type="date" id="scan-start" value="${view.scanStart}"></label><label class="field">结束日期<input type="date" id="scan-end" value="${view.scanEnd}"></label><button class="primary" data-action="scan" ${!view.loggedIn||view.scanning?'disabled':''}>${icon('search')}${view.scanning?'正在扫描…':'立即重新扫描'}</button><span class="scan-note">登录或修改日期后自动扫描，也可手动强制刷新</span></div>
    ${view.scanning?empty('正在读取课表…','可以切换到其他页面，扫描会继续。'):state.scanError?empty('扫描失败',esc(state.scanError)):view.scanned?rows.length?`<div class="table-wrap"><table><thead><tr><th><input type="checkbox" id="scan-all" aria-label="选择所有可获取课件"></th><th>课程</th><th>上课日期</th><th>页数</th><th>资料状态</th></tr></thead><tbody>${rows.map(c=>`<tr><td><input type="checkbox" data-scan-select="${esc(c.id)}" aria-label="选择 ${esc(c.title)}" ${view.scanSelected.has(c.id)?'checked':''} ${exists(c.id)||scheduled(c.id)?'disabled':''}></td><td><div class="course-title">${esc(c.title)}</div><small>课次 ${esc(c.sub_id)}</small></td><td>${esc(c.day)}</td><td><small>获取后统计</small></td><td>${exists(c.id)?'<span class="badge exported">已在资料库</span>':scheduled(c.id)?'<span class="badge editing">获取中</span>':'<span class="badge pending">可获取</span>'}</td></tr>`).join('')}</tbody></table></div>`:empty('这个日期范围内没有课程','请选择实际有课的日期，或重新登录后再试。'):empty(view.loggedIn?'选择日期，开始查找课件':'连接平台后查找课件',view.loggedIn?'扫描结果会显示在这里。':'在学校网页中完成登录，课页会自动检测并开始扫描。')}
    <div class="scan-bottom"><span>已选择 <strong>${view.scanSelected.size}</strong> 节课</span><div class="actions"><label title="无需整理，下载完成后自动生成 PDF"><input type="checkbox" id="direct-export" ${view.directExport?'checked':''}>获取完成后自动导出 PDF</label><button class="primary" data-action="download" ${!view.scanSelected.size||view.scanning?'disabled':''}>${icon('download')}获取选中课件</button></div></div></section><div class="helper-note">${icon('info')}<span>整理不是导出的前置条件：可以下载后自动导出，也可以在课程页随时快速导出。<br>快速导出使用当前保留页面，保存到默认目录；原始页面始终保留。</span></div>`;
}
function renderAcquire(){
  acquireMarkup();
  if(state.loginStatus)main.querySelector('.source-row')?.insertAdjacentHTML('afterend',`<div class="login-status" role="status"><span>${esc(state.loginStatus)}</span>${state.loginWindowOpen?`<div class="login-status-actions"><button data-action="login-home">平台首页</button><button data-action="login-reload">刷新网页</button><button data-action="login-check">立即检测</button></div>`:''}</div>`);
  const table=main.querySelector('.table-wrap');if(!table)return;
  const groups=new Map();availableCourses.forEach(c=>{const key=c.groupId||String(c.course_id);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(c);});
  const unavailable=c=>activeMaterials().some(m=>m.sourceKey===c.id)||state.tasks.some(t=>t.sourceKey===c.id&&['queued','running','paused'].includes(t.status));
  table.innerHTML=`<div class="scan-group-tools"><label><input type="checkbox" id="scan-all"> 选择全部尚未获取课件</label><span>${groups.size} 门课程 · ${availableCourses.length} 节课</span></div>${[...groups].map(([id,items])=>{const fresh=items.filter(c=>!unavailable(c)),chosen=fresh.filter(c=>view.scanSelected.has(c.id));return `<section class="scan-course"><div class="scan-course-heading"><input type="checkbox" data-scan-group="${esc(id)}" ${fresh.length&&chosen.length===fresh.length?'checked':''} ${fresh.length?'':'disabled'} aria-label="选择 ${esc(items[0].title)} 尚未获取课件"><button data-scan-expand="${esc(id)}"><strong>${esc(items[0].title)}</strong><span>本次 ${items.length} 节 · 已获取 / 获取中 ${items.length-fresh.length} · 新增 ${fresh.length}</span></button><button data-scan-expand="${esc(id)}">${view.scanExpanded.has(id)?'收起课次':'查看课次'}</button></div>${view.scanExpanded.has(id)?`<div class="scan-lectures">${items.slice().sort((a,b)=>a.day.localeCompare(b.day)).map(c=>`<label><input type="checkbox" data-scan-select="${esc(c.id)}" ${view.scanSelected.has(c.id)?'checked':''} ${unavailable(c)?'disabled':''}><span>${esc(c.day)}</span><small>课次 ${esc(c.sub_id)}</small><span class="badge ${unavailable(c)?'exported':'pending'}">${unavailable(c)?'已获取 / 获取中':'可获取'}</span></label>`).join('')}</div>`:''}</section>`;}).join('')}`;
  table.querySelectorAll('[data-scan-group]').forEach(el=>{const items=groups.get(el.dataset.scanGroup).filter(c=>!unavailable(c));const n=items.filter(c=>view.scanSelected.has(c.id)).length;el.indeterminate=n>0&&n<items.length;});
  const eligible=availableCourses.filter(c=>!unavailable(c));const count=eligible.filter(c=>view.scanSelected.has(c.id)).length;
  const all=table.querySelector('#scan-all');all.checked=eligible.length>0&&count===eligible.length;all.indeterminate=count>0&&count<eligible.length;
}


// —— 获取课件页的动作与表单注册 ——
const acquireLoginControl=async action=>{const found=await call('loginControl',{action});if(action==='check'&&!found)toast('尚未检测到完整登录状态，请继续在网页操作。');};
const acquireImport=async kind=>{
  if(view.importChoosing)return toast('文件选择窗口已打开，请先完成选择。');
  view.importChoosing=true;closeModal();toast('正在打开文件选择窗口…');
  try{const added=await call('import',{kind,courseId:view.importCourseId});if(added){navigate('tasks');toast('已开始导入；进度显示在任务页。');}}
  finally{view.importChoosing=false;}
};
const acquireScan=()=>{clearTimeout(autoScanTimer);autoScanRequested=false;const start=$('#scan-start').value,end=$('#scan-end').value;if(!start||!end||start>end)return toast('请填写有效日期，开始日期不能晚于结束日期。');view.scanStart=start;view.scanEnd=end;view.scanSelected.clear();return call('scan',{start,end});};
registerActions({
  login:async()=>{await call('login');},
  'login-home':()=>acquireLoginControl('home'),
  'login-reload':()=>acquireLoginControl('reload'),
  'login-check':()=>acquireLoginControl('check'),
  logout:()=>call('logout'),
  scan:acquireScan,
  download:async()=>{const ids=[...view.scanSelected];if(await call('download',{ids,direct:view.directExport})){view.scanSelected.clear();navigate('tasks');toast('已将选中课件全部加入任务队列');}},
  import:()=>{view.importCourseId=view.page==='course'&&view.courseId!=='unfiled'?view.courseId:null;return showModal('导入本地资料',`<p>复制文件到资料库，保留源文件。多张图片合为一份课件，多个 PDF 分别导入。</p><p>选择课件目录时，会按图片文件夹分组；同一课次同时有图片和 PDF 时优先导入图片。</p>`, '<button data-action="close-modal">取消</button><button data-action="import-folder">选择目录</button><button class="primary" data-action="import-files">选择 PDF / 图片</button>');},
  'import-folder':()=>acquireImport('folder'),
  'import-files':()=>acquireImport('files'),
});
registerDataChanges({
  scanSelect:element=>{element.checked?view.scanSelected.add(element.dataset.scanSelect):view.scanSelected.delete(element.dataset.scanSelect);renderAcquire();},
  scanGroup:element=>{availableCourses.filter(c=>(c.groupId||String(c.course_id))===element.dataset.scanGroup&&!activeMaterials().some(m=>m.sourceKey===c.id)&&!state.tasks.some(t=>t.sourceKey===c.id&&['queued','running','paused'].includes(t.status))).forEach(c=>element.checked?view.scanSelected.add(c.id):view.scanSelected.delete(c.id));renderAcquire();},
});
registerFields({
  'scan-all':element=>{availableCourses.filter(c=>!activeMaterials().some(m=>m.sourceKey===c.id)&&!state.tasks.some(t=>t.sourceKey===c.id&&['queued','running','paused'].includes(t.status))).forEach(c=>element.checked?view.scanSelected.add(c.id):view.scanSelected.delete(c.id));renderAcquire();},
  'direct-export':element=>{view.directExport=element.checked;},
  'scan-start':element=>{view.scanStart=element.value;scheduleAutoScan();},
  'scan-end':element=>{view.scanEnd=element.value;scheduleAutoScan();},
});
