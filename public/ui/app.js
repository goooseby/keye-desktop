'use strict';

// 应用外壳：启动、快照、导航与渲染分发、模态与提示，以及全局事件入口。

let desktop=null;
let ready=false;
const updateState={info:null,checking:false,downloading:false,ready:false,progress:0,error:''};
const pending=new Map();
let sequence=0;
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
function showModal(title,body,actions=''){
  modal.classList.remove('fullscreen-modal');$('#modal-content').innerHTML=`<div class="modal-header"><h2>${title}</h2><button class="icon-button" data-action="close-modal" aria-label="关闭">${icon('close')}</button></div><div class="modal-body">${body}</div>${actions?`<div class="modal-actions">${actions}</div>`:''}`;if(!modal.open)modal.showModal();
}
function closeModal(){modal.close();modal.classList.remove('fullscreen-modal');}
function openMaterial(id){if(!activeMaterials().some(m=>m.id===id))return toast('请先从回收站恢复课件。');navigate('editor/'+id);}
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
  const handled=await runDataHandler(b,event);
  if(handled!==undefined)return handled;
  const page=event.target.closest('[data-preview]');
  if(page){clearTimeout(preview.timer);preview.timer=setTimeout(()=>preview(Number(page.dataset.preview)),220);return;}
  const action=b?.dataset.action;if(!action)return;
  return runAction(action,b,event);
}
document.addEventListener('change',event=>{handleChange(event).catch(fail);});
async function handleChange(event){
  const el=event.target;
  if(courseChange(el))return;
  const changed=await runDataChangeHandler(el);
  if(changed!==undefined)return changed;
  const field=runFieldHandler(el);
  if(field!==undefined)return field;
}
// 外壳级按钮：使用说明在任何页面都可用（必须在 app.js 里接线，页面模块不引用外壳函数）。
$('#help-button').addEventListener('click',showHelp);
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

// 外壳级动作：模态关闭与使用说明在任何页面都可用。
registerActions({'close-modal':()=>closeModal(),'show-help':()=>showHelp()});
