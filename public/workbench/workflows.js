'use strict';

// Local workflow simulations never invoke the desktop business API or read user files.
function fieldError(message,inputId) {
  let target=dialog.querySelector('.field-error');
  if(!target){target=document.createElement('p');target.className='field-error';target.setAttribute('role','alert');dialog.querySelector('.dialog-body').append(target);}
  target.textContent=message;
  WorkbenchMotion.enter(target);
  if(inputId){const input=document.getElementById(inputId);input?.setAttribute('aria-invalid','true');input?.focus();}
}
function createCourse() {
  const name=document.querySelector('#new-course-name').value.trim();
  if(!name)return fieldError('请输入课程名称。','new-course-name');
  if(courses.some(course=>course.name.toLowerCase()===name.toLowerCase()))return fieldError('已有同名课程，请使用不同的名称。','new-course-name');
  const id='course-'+Date.now();courses.push({id,name,color:'#2356bc',dark:'#152e60',short:'COURSE MATERIALS'});
  dialog.close();navigate('library',id);notify('课程已创建，可以导入课件。','success');
}
function confirmRename() {
  const input=document.querySelector('#rename-value'),name=input.value.trim();
  if(!name)return fieldError('课件名称不能为空。','rename-value');
  if(name.length>120)return fieldError('名称过长，请控制在 120 个字符以内。','rename-value');
  files.find(file=>file.id===ui.menuFile).title=name;dialog.close();render();
}
function confirmImport() {
  const chosen=[...document.querySelector('#import-files').files];
  if(!chosen.length)return fieldError('请先选择图片或 PDF。','import-files');
  if(chosen.some(file=>!(/\.(pdf|png|jpe?g|gif|webp|bmp|avif)$/i.test(file.name))))return fieldError('仅支持 PDF 和图片文件。','import-files');
  const courseId=document.querySelector('#import-course').value;
  const course=courses.find(course=>course.id===courseId);
  ui.tasks.unshift({id:'import-'+Date.now(),title:`${course.name} · ${chosen.length} 个文件`,description:'已演示文件选择 · 未读取文件内容，也未生成导入结果',status:'done',kind:'import'});
  dialog.close();navigate('tasks');
}
function showExport(ids) {
  if(WorkbenchBusiness.enabled)return WorkbenchBusiness.exportDialog(ids);
  const selected=ids.map(id=>files.find(file=>file.id===id&&!file.deleted)).filter(Boolean);
  if(!selected.length)return notify('请先选择需要导出的课件。');
  const empty=selected.find(file=>file.pages===file.excluded.size);
  if(empty)return notify(`「${empty.title}」没有保留页面，请先恢复至少一页。`);
  ui.exportIds=selected.map(file=>file.id);
  const multi=selected.length>1,pages=selected.reduce((sum,file)=>sum+file.pages-file.excluded.size,0);
  showDialog('导出 PDF',`<div class="dialog-summary">${icon('export')}<div><strong>${selected.length} 份课件 · ${pages} 页</strong><small>导出当前保留页面，并应用裁剪结果</small></div></div>
    ${multi?'<label>导出方式<select id="export-mode"><option value="separate">每份课件单独导出</option><option value="merge">合并为一个 PDF</option></select></label>':''}
    <label id="export-name-field" ${multi?'hidden':''}>文件名称<input id="export-name" value="${escapeHtml(multi?'课程资料':selected[0].title)}.pdf" maxlength="160"></label>
    <p id="separate-hint" ${multi?'':'hidden'}>每份 PDF 使用对应课件的名称。</p>
    <label>保存位置<input id="export-path" value="${escapeHtml(ui.exportDir)}"></label><p>本方案演示导出流程，不会生成实际 PDF。</p>`,button('取消','close-dialog','','button')+button('导出 PDF','confirm-export','export','primary'));
}
function confirmExport() {
  const path=document.querySelector('#export-path').value.trim(),separate=document.querySelector('#export-mode')?.value==='separate';
  const name=document.querySelector('#export-name').value.trim();
  if(!path)return fieldError('请填写保存目录。','export-path');
  if(!separate&&(!name||/[/\\:*?"<>|]/.test(name)||/[. ]$/.test(name)))return fieldError('请输入有效文件名，不要包含 / \\ : * ? " < > |。','export-name');
  ui.exportDir=path;
  ui.exportIds.forEach(id=>{const file=files.find(file=>file.id===id);if(file&&!file.deleted)file.exported=true;});
  dialog.close();render();notify('导出流程演示完成，未生成实际文件。','success');
}
function sourceRows() {
  return courses.slice(0,4).map((course,index)=>({id:'source-'+course.id,course:course.id,name:course.name,date:`2026-11-${13-index}`,title:`第 ${10-index} 次课 · 课堂课件`,pages:36-index*2}));
}
function scanRows() {
  if(WorkbenchBusiness.enabled)return ui.scanned?WorkbenchBusiness.scanRows():[];
  if(!ui.scanned||!ui.scanRange)return [];
  return sourceRows().filter(row=>row.date>=ui.scanRange.start&&row.date<=ui.scanRange.end);
}
function scanUnavailable(id) {
  if(WorkbenchBusiness.enabled)return WorkbenchBusiness.unavailable(id);
  return ui.scanAdded.has(id)||ui.tasks.some(task=>task.sourceId===id&&['running','paused'].includes(task.status));
}
function invalidateScan() {
  if(WorkbenchBusiness.enabled)WorkbenchBusiness.invalidateScan();
  ui.scanned=false;ui.scanRange=null;ui.scanSelected.clear();render();
}
function toggleConnection() {
  ui.connected=!ui.connected;
  if(!ui.connected){ui.scanned=false;ui.scanRange=null;ui.scanSelected.clear();}
  render();notify(ui.connected?'已模拟连接，可以扫描示例课次。':'已断开连接，已入队任务仍可继续。');
}
function scanCourses() {
  if(!ui.connected)return notify('请先连接课堂平台。');
  if(!ui.scanStart||!ui.scanEnd||ui.scanStart>ui.scanEnd)return notify('请填写有效日期范围。');
  if(ui.scanning)return;
  ui.scanning=true;ui.scanned=false;ui.scanSelected.clear();render();
  const range={start:ui.scanStart,end:ui.scanEnd};
  setTimeout(()=>{
    ui.scanning=false;
    if(ui.connected&&ui.scanStart===range.start&&ui.scanEnd===range.end){ui.scanRange=range;ui.scanned=true;}
    if(ui.page==='acquire')render();
  },350);
}
function acquisitionGroups() {
  return WorkbenchModel.scanGroups(scanRows(),ui.scanSelected,scanUnavailable,id=>ui.scanAdded.has(id));
}
function renderAcquire() {
  const active=document.activeElement,focus=active?.closest('.acquire-content')&&(active.tagName!=='BUTTON'||active.matches(':focus-visible'))?{id:active.id,tag:active.tagName,data:Object.entries(active.dataset),expand:active.matches('.scan-expand')}:null;
  const scroll=document.querySelector('#page > .content')?.scrollTop||0;
  const rows=scanRows(),eligible=rows.filter(row=>!scanUnavailable(row.id));
  ui.scanSelected=new Set([...ui.scanSelected].filter(id=>eligible.some(row=>row.id===id)));
  const groups=acquisitionGroups(),live=WorkbenchBusiness.enabled,state=live?WorkbenchBusiness.snapshot:null;
  const message=state?.loginStatus||(ui.connected?'已连接 · 按上课日期扫描课表':'在学校网页完成登录，华工课栈会自动检测。');
  const error=state?.scanError;
  document.querySelector('#page').innerHTML=heading('获取课件','按课程选择，再展开查看具体课次。',button('导入本地文件','import','upload','button'))+`
    <div class="content acquire-content">
      <div class="connection-bar">${icon('school')}<div><div class="connection-title"><h3>学校课堂平台</h3>${stateBadge(ui.connected?'已连接':'未连接',ui.connected?'success':'neutral',ui.connected?'check':'lock')}</div><p>${escapeHtml(message)}</p></div><span class="spacer"></span>
        ${ui.connected?button('重新登录','reconnect','','button')+button('断开','connect'):button('连接平台','connect','export','primary')}</div>
      ${state?.loginWindowOpen?`<div class="login-controls" role="status"><span>请在登录窗口完成操作</span><span class="spacer"></span>${button('平台首页','login-home')}${button('刷新网页','login-reload')}${button('立即检测','login-check')}</div>`:''}
      <div class="date-controls acquire-dates"><label>从 <input id="scan-start" type="date" value="${ui.scanStart}" aria-label="开始日期"></label><label>至 <input id="scan-end" type="date" value="${ui.scanEnd}" aria-label="结束日期"></label>
        ${button(ui.scanning?'正在扫描…':'扫描课表','scan','refresh','button',ui.connected&&!ui.scanning?'':'disabled')}<span class="spacer"></span><small>修改日期后自动扫描</small></div>
      ${ui.scanning?`<div class="empty">${icon('refresh')}<h2>正在查找课次…</h2><p>可以切换页面，扫描会在后台继续。</p></div>`:error?`<div class="empty">${icon('alert')}<h2>扫描失败</h2><p>${escapeHtml(error)}</p>${button('重新扫描','scan','refresh','button')}</div>`:ui.scanned&&rows.length?`
        <div class="scan-group-tools"><label><input id="scan-all" type="checkbox" aria-label="选择全部尚未获取课次" ${eligible.length&&ui.scanSelected.size===eligible.length?'checked':''} ${eligible.length?'':'disabled'}>选择全部可获取课次</label><span>${groups.length} 门课程 · ${rows.length} 节课</span></div>
        <div class="scan-course-list">${groups.map((group,index)=>{
          const expanded=ui.scanExpanded.has(group.id),pending=group.items.length-group.stored-group.eligible.length;
          return `<section class="scan-course" data-scan-course="${escapeHtml(group.id)}">
            <div class="scan-course-heading"><input type="checkbox" data-scan-group="${escapeHtml(group.id)}" aria-label="选择 ${escapeHtml(group.name)} 可获取课次" ${group.checked?'checked':''} ${group.eligible.length?'':'disabled'}>
              <span class="scan-course-icon" style="--course-ink:${['#2356bc','#7256b8','#007e9c','#c26829'][index%4]}">${icon('folder')}</span>
              <button class="scan-course-title" data-scan-expand="${escapeHtml(group.id)}" aria-expanded="${expanded}" aria-controls="scan-lessons-${escapeHtml(group.id)}"><strong>${escapeHtml(group.name)}</strong><small>共 ${group.items.length} 节${group.stored?' · 已获取 '+group.stored+' 节':''}${pending?' · 获取中 '+pending+' 节':''}${group.chosen.length?' · 已选 '+group.chosen.length+' 节':''}</small></button>
              ${stateBadge(group.eligible.length?'可获取 '+group.eligible.length+' 节':pending?'获取中':'已全部获取',group.eligible.length?'info':pending?'info':'success',group.eligible.length?'download':'check')}
              <button class="scan-expand" data-scan-expand="${escapeHtml(group.id)}" aria-expanded="${expanded}" aria-controls="scan-lessons-${escapeHtml(group.id)}" aria-label="${expanded?'收起':'展开'} ${escapeHtml(group.name)}">${icon(expanded?'down':'right')}</button></div>
            ${expanded?`<div class="scan-lessons" id="scan-lessons-${escapeHtml(group.id)}">${group.items.map(row=>{
              const stored=ui.scanAdded.has(row.id),blocked=scanUnavailable(row.id);
              return `<label class="scan-lesson ${blocked?'unavailable':''}"><input type="checkbox" data-scan="${escapeHtml(row.id)}" aria-label="选择 ${escapeHtml(group.name)} ${escapeHtml(row.date)} 课次 ${escapeHtml(row.sub_id||'')}" ${ui.scanSelected.has(row.id)?'checked':''} ${blocked?'disabled':''}><time>${escapeHtml(row.date)}</time><span class="lesson-number">课次 ${escapeHtml(row.sub_id||row.title.replace(/^课次\s*/,''))}</span><span class="spacer"></span>${stateBadge(stored?'已获取':blocked?'获取中':'可获取',stored?'success':blocked?'info':'neutral',stored?'check':blocked?'clock':'download')}</label>`;
            }).join('')}</div>`:''}</section>`;
        }).join('')}</div>`:
        `<div class="empty">${icon(ui.scanned?'search':'download')}<h2>${ui.scanned?'这个日期范围内没有课次':ui.connected?'选择日期，开始扫描':'连接平台，查找课件'}</h2><p>${ui.scanned?'调整日期范围后重新扫描。':ui.connected?'扫描结果按课程归类，支持整门课程选择。':'本地资料库始终可用，也可以导入已有文件。'}</p>${button(ui.connected?'扫描课表':'连接平台',ui.connected?'scan':'connect',ui.connected?'search':'export','button')}</div>`}
    </div>${ui.scanned&&rows.length&&!ui.scanning&&!error?`<div class="scan-selection-bar"><strong>已选择 ${ui.scanSelected.size} 节课</strong><span class="spacer"></span><label class="scan-direct"><input type="checkbox" id="scan-direct-export" ${ui.scanDirectExport?'checked':''}>获取后直接导出 PDF</label>${button('获取选中课件','download','download','primary',ui.scanSelected.size?'':'disabled')}</div>`:''}`;
  const all=document.querySelector('#scan-all');if(all)all.indeterminate=ui.scanSelected.size>0&&ui.scanSelected.size<eligible.length;
  document.querySelectorAll('[data-scan-group]').forEach(input=>{input.indeterminate=groups.find(group=>group.id===input.dataset.scanGroup)?.partial||false;});
  document.querySelector('#page > .content').scrollTop=scroll;
  if(focus){const candidates=focus.id?[document.getElementById(focus.id)]:[...document.querySelectorAll('.acquire-content button,.acquire-content input')];candidates.find(el=>el&&el.tagName===focus.tag&&!el.disabled&&el.matches('.scan-expand')===focus.expand&&focus.data.every(([key,value])=>el.dataset[key]===value))?.focus({preventScroll:true});}
}
function downloadSelection() {
  const selected=scanRows().filter(row=>ui.scanSelected.has(row.id)&&!scanUnavailable(row.id));
  if(!selected.length)return notify('请先选择可获取的课次。');
  selected.forEach(row=>ui.tasks.unshift({id:'task-'+row.id+'-'+Date.now(),sourceId:row.id,source:{...row},title:row.name+' · '+row.title,description:'等待获取 · 演示任务',status:'running',progress:0,kind:'download'}));
  ui.scanSelected.clear();ui.tasksFilter='running';navigate('tasks');startDemoTasks();
}
let demoTaskTimer;
function startDemoTasks() {
  if(demoTaskTimer)return;
  demoTaskTimer=setInterval(()=>{
    const active=ui.tasks.filter(task=>task.status==='running').slice(0,Number(ui.workers));
    let completed=false;
    active.forEach(task=>{
      task.progress=Math.min(100,task.progress+4);
      task.description=`正在获取 · ${Math.floor(task.progress*task.source.pages/100)} / ${task.source.pages} 页 · 演示任务`;
      if(task.progress===100){
        completed=true;
        task.status='done';task.description=`获取完成 · ${task.source.pages} 页 · 示例课件`;
        ui.scanAdded.add(task.sourceId);
        const file={id:task.sourceId,course:task.source.course,title:task.source.title,date:task.source.date,pages:task.source.pages,review:'pending',exported:!!ui.scanDirectExport,excluded:new Set(),crops:new Map(),history:[],lastPage:1,deleted:false};
        if(!files.some(item=>item.id===file.id))files.unshift(file);
      }
    });
    if(completed&&(ui.page==='tasks'||ui.page==='acquire'))render();
    else if(ui.page==='tasks')active.forEach(task=>{
      const row=[...document.querySelectorAll('[data-task-row]')].find(row=>row.dataset.taskRow===task.id);
      if(row){row.querySelector('.progress-track span').style.width=task.progress+'%';row.querySelector('[role=progressbar]').setAttribute('aria-valuenow',task.progress);row.querySelector('.progress-number').textContent=task.progress+'%';row.querySelector('.task-description p').textContent=task.description;}
    });
    if(!ui.tasks.some(task=>task.status==='running')){
      clearInterval(demoTaskTimer);demoTaskTimer=null;
      if(ui.tasksFilter==='running'&&!ui.tasks.some(task=>task.status==='paused')){ui.tasksFilter='all';if(ui.page==='tasks')render();}
    }
  },500);
}
function toggleTask(element) {
  const task=ui.tasks.find(task=>task.id===element.dataset.taskId);if(!task||!['running','paused'].includes(task.status))return;
  task.status=task.status==='paused'?'running':'paused';
  task.description=task.status==='paused'?'已暂停 · 可以随时继续':'等待继续获取 · 演示任务';
  render();if(task.status==='running')startDemoTasks();
}
function cancelTask(element) {
  const task=ui.tasks.find(task=>task.id===element.dataset.taskId);if(!task)return;
  task.status='cancelled';task.description='已取消 · 可在获取课件中重新加入';render();
}
function taskButtons(task) {
  const live=WorkbenchBusiness.enabled,attrs=`data-task-id="${escapeHtml(task.id)}"`;
  if(['queued','running','paused'].includes(task.status))return (task.type==='scan'?'':button(task.status==='paused'?'继续':'暂停','pause',task.status==='paused'?'play':'pause','button',attrs))+button('取消','cancel-task','','',attrs);
  if(task.type==='scan')return button(task.status==='done'?'查看课表':'重新扫描','acquire','search','button');
  if(live&&['failed','cancelled'].includes(task.status))return button('重试','retry-task','refresh','button',attrs);
  if(task.status==='attention')return button('查看说明','task-info','help','button',attrs);
  const id=task.fileId||task.sourceId;
  if(!id)return live?button('查看资料库','show-library','files','button'):'';
  const material=files.find(file=>file.id===id&&!file.deleted);
  return button('打开课件','open-task','arrow','button',`data-target-file="${escapeHtml(id)}" ${live&&!material?'disabled':''}`)+(['export','batch'].includes(task.type)?button('输出目录','open-output','folder','',`data-target-file="${escapeHtml(id)}"`):'');
}
function renderTasks() {
  const savedScroll=document.querySelector('#page > .content')?.scrollTop||0;
  const active=document.activeElement,focus=active?.closest('.task-line')?{task:active.dataset.taskId,action:active.dataset.action}:null;
  const items=WorkbenchBusiness.enabled?[...ui.tasks].reverse():[...ui.tasks,{id:'export1',title:'非线性优化.pdf',description:'导出完成 · 32 页 · 示例记录',status:'done',fileId:'math5'},
    {id:'get1',title:'计算机网络 · 第 07 次课',description:'获取完成 · 42 页 · 示例记录',status:'done',fileId:'net7'},
    {id:'warn1',title:'项目管理与沟通 · 第 05 次课',description:'获取完成 · 原始第 18 页不可用，其余 28 页已保存',status:'attention'}];
  const match=(task,id)=>id==='all'||(id==='running'?['queued','running','paused'].includes(task.status):id==='attention'?['attention','failed'].includes(task.status):id==='done'?['done','attention'].includes(task.status):task.status===id);
  const filtered=items.filter(task=>match(task,ui.tasksFilter));
  document.querySelector('#page').innerHTML=heading('任务','获取、导入与导出记录。',button('获取课件','acquire','download','button'))+`
    <div class="toolbar"><div class="filter-tabs">${[['all','全部任务'],['running','进行中'],['done','已完成'],['attention','需关注'],['cancelled','已取消']].map(([id,label])=>`<button class="${ui.tasksFilter===id?'active':''}" data-task-filter="${id}">${label}<small class="task-count">${items.filter(task=>match(task,id)).length}</small></button>`).join('')}</div></div>
    <div class="content">${filtered.map(task=>{
      const symbol=task.status==='done'?'circleCheck':['attention','failed'].includes(task.status)?'alert':task.status==='paused'?'pause':task.status==='cancelled'?'close':task.status==='queued'?'clock':'download';
      const tone={done:'success',attention:'warning',failed:'warning',queued:'info',paused:'paused',cancelled:'neutral',running:'info'}[task.status];
      const label={done:'已完成',attention:'有缺页',failed:'失败',queued:'排队中',paused:'已暂停',cancelled:'已取消',running:'进行中'}[task.status];
      return `<div class="task-line" data-task-row="${task.id}" data-state="${task.status}">
        <span class="task-symbol">${icon(symbol)}</span><div class="task-description">
          <div class="task-title"><strong>${escapeHtml(task.title)}</strong>${stateBadge(label,tone,symbol)}</div>
          <p>${escapeHtml(task.description)}</p>
          ${['running','paused'].includes(task.status)?`<div class="task-progress"><div class="progress-track" role="progressbar" aria-label="${escapeHtml(task.title)}的进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${task.progress}"><span style="width:${task.progress}%"></span></div><small class="progress-number">${task.progress}%</small></div>`:''}
        </div>
        ${taskButtons(task)}
      </div>`;
    }).join('')||'<div class="empty"><h2>这里还没有任务</h2><p>切换筛选或获取新的课件。</p></div>'}</div>`;
  document.querySelector('#page > .content').scrollTop=savedScroll;
  if(focus)[...document.querySelectorAll('.task-line button')].find(button=>button.dataset.taskId===focus.task&&button.dataset.action===focus.action)?.focus({preventScroll:true});
}
