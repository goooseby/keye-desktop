'use strict';

// 任务页：下载与导出任务的进度、暂停、取消与重试。

function renderTasks(){
  const tasks=state.tasks.filter(t=>view.taskFilter==='all'||(view.taskFilter==='active'?['queued','running','paused'].includes(t.status):view.taskFilter==='failed'?t.status==='failed':t.status==='done'));
  main.innerHTML=`<div class="page-heading"><div><h1>任务</h1></div><button data-nav="acquire">${icon('plus')}获取课件</button></div><div class="toolbar"><div class="tabs">${[['all','全部任务'],['active','进行中'],['done','已完成'],['failed','失败']].map(([id,label])=>`<button data-task-filter="${id}" class="${view.taskFilter===id?'active':''}">${label}</button>`).join('')}</div></div>${tasks.length?`<div class="task-list">${[...tasks].reverse().map(t=>`<article class="task-row"><div class="task-icon">${icon(t.type==='export'?'export':t.type==='scan'?'search':'download')}</div><div class="task-copy"><h3>${esc(t.title)}</h3><p>${{download:'下载',export:'导出',batch:'批量导出',import:'导入',scan:'扫描'}[t.type]} · ${{queued:'等待中',running:'正在处理',paused:'已暂停',done:'已完成',cancelled:'已取消',failed:'失败'}[t.status]}${['queued','running','paused'].includes(t.status)?` · ${t.progress}% · ${esc(t.message)}`:''}</p>${t.error?`<p class="task-error">${esc(t.error)}</p>`:''}${['queued','running','paused'].includes(t.status)?`<div class="task-progress"><span style="width:${t.progress}%"></span></div>`:''}</div><div class="actions">${['queued','running','paused'].includes(t.status)?`${t.type==='scan'?'':`<button data-task-toggle="${t.id}">${icon(t.status==='paused'?'play':'pause')}${t.status==='paused'?'继续':'暂停'}</button>`}<button data-task-cancel="${t.id}">取消</button>`:t.status==='done'?t.materialId?`<button data-open="${t.materialId}" ${!activeMaterials().some(m=>m.id===t.materialId)?'disabled':''}>打开课件 ${icon('arrow')}</button>${['export','batch'].includes(t.type)?`<button data-output="${t.materialId}">打开目录</button>`:''}`:'<button data-nav="acquire">查看课表</button>':t.type==='scan'?'<button data-nav="acquire">重新扫描</button>':`<button data-task-retry="${t.id}">重试</button>`}</div></article>`).join('')}</div>`:empty('暂无'+(view.taskFilter==='active'?'进行中的':'')+'任务','获取课件或导入本地文件后，任务记录会出现在这里。','<button class="primary" data-nav="acquire">前往获取课件</button>')}`;
}

// —— 任务页的动作注册 ——
registerDataHandlers({
  taskFilter:element=>{view.taskFilter=element.dataset.taskFilter;renderTasks();},
  taskToggle:element=>call('task',{id:element.dataset.taskToggle,action:'toggle'}),
  taskCancel:element=>call('task',{id:element.dataset.taskCancel,action:'cancel'}),
  taskRetry:element=>call('task',{id:element.dataset.taskRetry,action:'retry'}),
});
