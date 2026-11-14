'use strict';

// Explicit business boundary for the approved workbench. Never loads legacy UI.
const WorkbenchBusiness = (() => {
  const enabled=document.documentElement.dataset.business==='live';
  let bridge=null,snapshot=null,busy=false,exporting=false;
  let scannedRange=null;
  let autoScanTimer=null,autoScanRequested=false;
  let scanInFlight=false,snapshotPending=false;
  let reviewQueue=[],reviewScope='all';
  const pageTimers=new Map();
  const dimensions=new Map(),fullDimensions=new Set(),loadingImages=new Set();
  const error=reason=>notify(reason?.message||String(reason),'warning');
  const call=(command,data={})=>bridge.call(command,data);
  const missing=(file,page)=>file?.missingPages?.some(item=>item.page===page);
  function apply(next,{owned=false}={}) {
    const switched=snapshot&&snapshot.settings.libraryDir!==next.settings.libraryDir;
    if(switched){reviewQueue=[];closeViewer();WorkspaceTabs.reset();libraryScroll.clear();reviewUi.scrolls.clear();ui.selected.clear();ui.focused=null;ui.scope='all';ui.query='';ui.downloadDraft={};}
    const previous=new Map(files.map(file=>[file.id,file]));
    const mapped=next.materials.map(material=>{
      const old=switched?null:previous.get(material.id);
      const translated=WorkbenchModel.file(material,old);
      if(!next.courseLibrary.some(course=>course.id===translated.course))translated.course='unfiled';
      if(old&&pageTimers.has(material.id))translated.lastPage=old.lastPage;
      if(old&&!owned&&old.revision!==material.revision)translated.history=[];
      return old?Object.assign(old,translated):translated;
    });
    // Close a removed document while its old model still exists for viewer cleanup.
    const valid=new Set(mapped.filter(file=>!file.deleted).map(file=>file.id));
    if(reviewQueue.includes(ui.openFile)&&!valid.has(ui.openFile))reviewQueue=[];
    WorkspaceTabs.reconcile(valid);
    files.splice(0,files.length,...mapped);courses.splice(0,courses.length,...WorkbenchModel.courses(next));
    const wasConnected=ui.connected,previousMode=snapshot?.settings.exportMode;
    snapshot=next;ui.connected=!!next.loggedIn;ui.scanned=!!next.scanned&&scannedRange===ui.scanStart+':'+ui.scanEnd;ui.scanning=!!next.scanning;
    ui.scanAdded=new Set(next.materials.map(m=>m.sourceKey));ui.scanTrash=new Set(next.materials.filter(m=>m.deleted).map(m=>m.sourceKey));
    if((next.pendingCourseDeletions||[]).some(op=>op.courseId===reviewScope))reviewQueue=[];
    ui.workers=String(next.settings.maxWorkers||2);ui.downloadAfter=next.settings.exportMode==='direct'?'export':'store';ui.exportDir=next.settings.exportDir||'';
    if(previousMode!==next.settings.exportMode||ui.scanDirectExport===undefined)ui.scanDirectExport=next.settings.exportMode==='direct';
    if(!ui.connected){clearTimeout(autoScanTimer);autoScanRequested=false;scannedRange=null;ui.scanSelected.clear();}
    ui.updateCheck=next.updatePreferences?.autoCheck!==false;
    ui.tasks=next.tasks.map(WorkbenchModel.task);
    ui.recent=ui.recent.filter(id=>valid.has(id));
    if(!ui.recent.length)ui.recent=next.materials.filter(m=>!m.deleted).sort((a,b)=>(b.touched||0)-(a.touched||0)).map(m=>m.id);
    if(!courses.some(c=>c.id===ui.scope&&!c.pending)&&!['all','recent','trash'].includes(ui.scope))ui.scope='all';
    ui.selected=new Set([...ui.selected].filter(id=>files.some(f=>f.id===id)));
    render();syncSaving();
    if(!wasConnected&&ui.connected)scheduleScan(200);
    else if(autoScanRequested&&!ui.scanning&&!busy)scheduleScan(100);
  }
  async function refresh(owned=false){apply(await call('snapshot'),{owned});}
  async function execute(command,data={},effect){
    if(busy){notify('正在完成上一项操作，请稍候。');return false;}
    busy=true;syncSaving();
    try{
      const result=await call(command,data);
      if(result!==false)effect?.();
      snapshotPending=false;await refresh(true);return result;
    }catch(reason){
      // Read authoritative data after a conflict without discarding the draft.
      try{await refresh();}catch{}
      error(reason);return false;
    }finally{busy=false;syncSaving();if(snapshotPending){snapshotPending=false;void refresh().catch(error);}if(autoScanRequested&&!ui.scanning)scheduleScan(100);}
  }
  async function runScan(){
    clearTimeout(autoScanTimer);autoScanRequested=false;
    if(!ui.scanStart||!ui.scanEnd||ui.scanStart>ui.scanEnd)return notify('请填写有效的日期范围。');
    if(ui.scanning||scanInFlight||busy)return;
    scannedRange=ui.scanStart+':'+ui.scanEnd;ui.scanSelected.clear();ui.scanning=true;ui.scanned=false;scanInFlight=true;
    if(ui.page==='acquire')renderAcquire();
    try{await call('scan',{start:ui.scanStart,end:ui.scanEnd});}catch(reason){error(reason);}
    finally{scanInFlight=false;if(busy)snapshotPending=true;else await refresh().catch(error);if(autoScanRequested&&!ui.scanning)scheduleScan(100);}
  }
  function scheduleScan(delay=650){
    clearTimeout(autoScanTimer);autoScanRequested=true;
    if(!ui.connected||ui.scanning||busy)return;
    autoScanTimer=setTimeout(()=>{if(!ui.connected||ui.scanning||busy)return;autoScanRequested=false;Promise.resolve(handlers.scan()).catch(error);},delay);
  }
  function syncSaving(){
    document.querySelectorAll('.save-state').forEach(el=>el.innerHTML=icon(busy?'clock':'check')+(busy?'正在保存…':'更改已保存'));
    const status=document.querySelector('.app-status > span');if(status&&ui.page==='editor')status.textContent=busy?'正在保存…':'更改已保存';
    document.querySelectorAll('[data-action="complete"],[data-action="export-current"],[data-action="exclude"],[data-action="exclude-selected"],[data-action="restore-selected-pages"],[data-action="undo"],[data-action="crop"],[data-action="reset-crop"],[data-action="crop-all"],[data-action="crop-selected"]').forEach(control=>{
      if(busy){if(!('saveDisabled' in control.dataset))control.dataset.saveDisabled=String(control.disabled);control.disabled=true;}
      else if('saveDisabled' in control.dataset){control.disabled=control.dataset.saveDisabled==='true';delete control.dataset.saveDisabled;}
    });
  }
  function canLeave(){if(busy){notify('操作正在进行，请稍候再切换或关闭。');return false;}return true;}
  async function commit(file,excluded,crops,{undo=false,finish=false}={}){
    if(busy)return false;
    const previous={excluded:new Set(file.excluded),crops:new Map([...file.crops].map(([p,r])=>[p,{...r}]))};
    const result=await execute('pageState',WorkbenchModel.pageState(file,excluded,crops),()=>{
      if(undo)file.history.pop();else file.history.push(previous);
      reviewUi.selected.clear();if(finish)ui.crop=null;
    });
    if(result)notify(undo?'已撤销上次修改。':'修改已保存，原始页面保留。','success');
    return result;
  }
  function pageVisited(id,page){
    clearTimeout(pageTimers.get(id));
    pageTimers.set(id,setTimeout(()=>{pageTimers.delete(id);call('lastPage',{id,page}).catch(error);},240));
  }
  function opened(id){call('openMaterial',{id}).catch(error);}
  async function flushPages(){
    await Promise.all([...pageTimers.keys()].map(async id=>{clearTimeout(pageTimers.get(id));pageTimers.delete(id);const file=files.find(f=>f.id===id);if(file)await call('lastPage',{id,page:file.lastPage});}));
  }
  function artwork(file,page,useCrop,thumb=false){
    const media=file.media?.[page-1],hole=file.missingPages?.find(item=>item.page===page);
    if(!media||hole)return `<svg class="slide-art" viewBox="0 0 960 540" role="img" aria-label="原始第 ${page} 页缺失"><rect width="960" height="540" fill="#f1f4f8"/><text x="480" y="250" text-anchor="middle" fill="#526173" font-size="28">原始第 ${page} 页暂不可用</text><text x="480" y="300" text-anchor="middle" fill="#526173" font-size="16">${escapeHtml(hole?.reason||'页面资源不可用')}</text></svg>`;
    const crop=useCrop&&file.crops.get(page),key=file.id+':'+page;
    const size=dimensions.get(key),w=size?.width||960,h=size?.height||540;
    const view=crop?`${crop.x*w} ${crop.y*h} ${crop.w*w} ${crop.h*h}`:`0 0 ${w} ${h}`;
    const src=thumb?media.thumb:media.src;
    const requestKey=key+(thumb?':thumb':':full');
    if((!size||!thumb&&!fullDimensions.has(key))&&!loadingImages.has(requestKey)){
      loadingImages.add(requestKey);const image=new Image();image.onload=()=>{
        loadingImages.delete(requestKey);
        if(thumb&&fullDimensions.has(key))return;
        if(!thumb)fullDimensions.add(key);
        dimensions.set(key,{width:image.naturalWidth,height:image.naturalHeight});
        document.querySelectorAll(`[data-media-key="${CSS.escape(key)}"]`).forEach(svg=>{
          const r=svg.dataset.mediaCrop?JSON.parse(svg.dataset.mediaCrop):null,w=image.naturalWidth,h=image.naturalHeight;
          svg.setAttribute('viewBox',r?`${r.x*w} ${r.y*h} ${r.w*w} ${r.h*h}`:`0 0 ${w} ${h}`);
          svg.style.aspectRatio=r?r.w*w/(r.h*h):w/h;svg.querySelector('image').setAttribute('width',w);svg.querySelector('image').setAttribute('height',h);
        });
        if(viewerOpen())fitViewer();
      };image.onerror=()=>{loadingImages.delete(requestKey);};image.src=src;
    }
    return `<svg class="slide-art live-slide" data-media-key="${escapeHtml(key)}" data-media-crop='${crop?JSON.stringify(crop):''}' viewBox="${view}" role="img" aria-label="${escapeHtml(file.title)}，第 ${page} 页" style="aspect-ratio:${crop?crop.w*w/(crop.h*h):w/h}"><image width="${w}" height="${h}" href="${escapeHtml(src)}" preserveAspectRatio="xMidYMid meet"/></svg>`;
  }
  function scanRows(){return (snapshot?.courses||[]).map(row=>({...row,name:row.title,title:'课次 '+row.sub_id,date:row.day,pages:null}));}
  function coursePending(id){const lesson=snapshot.courses.find(course=>course.id===id);return (snapshot.pendingCourseDeletions||[]).some(op=>op.courseId===lesson?.groupId);}
  function unavailable(id){return snapshot.materials.some(m=>m.sourceKey===id)||snapshot.tasks.some(t=>t.sourceKey===id&&['queued','running','paused'].includes(t.status))||coursePending(id);}
  async function saveSetting(data){return execute('settings',data);}
  async function exportFiles(){
    if(exporting)return notify('正在生成 PDF，请稍候。');
    const ids=ui.exportIds||[],name=document.querySelector('#export-name')?.value.trim();
    if(!ids.length)return;
    if(ids.length===1&&(!name||/[/\\:*?"<>|]/.test(name)))return fieldError('请输入有效的 PDF 文件名。','export-name');
    const mode=document.querySelector('#export-mode')?.value==='merge'?'combined':'separate';
    exporting=true;dialog.close();notify('正在生成 PDF；未设置导出目录时，请在系统窗口选择位置。');
    try{const result=await call(ids.length===1?'export':'batchExport',ids.length===1?{id:ids[0],name:name.replace(/\.pdf$/i,'')}:{ids,mode});if(busy)snapshotPending=true;else await refresh();if(result)notify('PDF 导出完成。','success');}
    catch(reason){error(reason);}
    finally{exporting=false;}
  }
  async function batchReview(){
    const chosen=[...ui.selected].map(id=>files.find(f=>f.id===id)).filter(Boolean);
    for(const file of chosen)if(!await execute('reviewed',{id:file.id,revision:file.revision}))return;
    ui.selected.clear();render();
  }
  function reviewContext(file){
    const index=reviewQueue.indexOf(file.id),next=index<0?null:reviewQueue.slice(index+1).map(id=>files.find(f=>f.id===id&&!f.deleted)).find(Boolean);
    return {active:index>=0,next,index,total:reviewQueue.length};
  }
  function startReview(items){
    if(!canLeave())return;
    const chosen=items.filter(file=>!file.deleted).sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
    if(!chosen.length)return notify('没有需要整理的课件。');
    reviewQueue=chosen.map(file=>file.id);reviewScope=ui.scope;
    openFile(chosen[0].id,{review:true});
  }
  async function completeReview(){
    const file=currentFile(),context=reviewContext(file);if(busy||file.review==='done'&&!context.active)return;
    if(file.review!=='done'&&!await execute('reviewed',{id:file.id,revision:file.revision}))return;
    if(!context.active)return notify('已完成整理。','success');
    const next=reviewContext(file).next;
    if(next)openFile(next.id,{review:true});
    else{reviewQueue=[];navigate('library',reviewScope);notify('本次整理已完成。','success');}
  }
  async function restore(ids){for(const id of ids)if(!await execute('trash',{id,deleted:false}))return;ui.selected.clear();dialog.close();render();}
  function importDialog(){showDialog('导入本地文件',`<p>图片可合为一份课件，多个 PDF 分别导入。原始文件保留。</p><label>归入课程<select id="import-course"><option value="">未归类</option>${courses.filter(c=>c.id!=='unfiled'&&!c.pending).map(c=>`<option value="${escapeHtml(c.id)}" ${ui.scope===c.id?'selected':''}>${escapeHtml(c.name)}</option>`).join('')}</select></label>`,button('取消','close-dialog','','button')+button('选择目录','import-folder','folder','button')+button('选择 PDF / 图片','confirm-import','upload','primary'));}
  function exportDialog(ids){
    const chosen=ids.map(id=>files.find(f=>f.id===id&&!f.deleted)).filter(Boolean);
    if(!chosen.length||chosen.some(f=>f.excluded.size===f.pages))return notify('请选择至少保留一页的课件。');
    ui.exportIds=chosen.map(f=>f.id);
    showDialog('导出 PDF',`<div class="dialog-summary">${icon('export')}<div><strong>${chosen.length} 份课件 · ${chosen.reduce((n,f)=>n+f.pages-f.excluded.size,0)} 页</strong><small>应用当前排除和裁剪结果</small></div></div>${chosen.length>1?'<label>导出方式<select id="export-mode"><option value="separate">每份课件单独导出</option><option value="merge">合并为一个 PDF</option></select></label>':`<label>文件名称<input id="export-name" value="${escapeHtml(chosen[0].title)}.pdf"></label>`}<p>保存到：${escapeHtml(ui.exportDir||'导出时选择目录')}。现有文件保留，重名时自动编号。</p>`,button('更改目录','export-dir','folder','button')+button('取消','close-dialog','','button')+button('导出 PDF','confirm-export','export','primary'));
  }
  const handlers={
    import:importDialog,
    'confirm-import':()=>importFiles('files'),'import-folder':()=>importFiles('folder'),
    'confirm-export':exportFiles,
    'create-course':async()=>{const name=document.querySelector('#new-course-name').value.trim();if(!name)return fieldError('请输入课程名称。','new-course-name');const result=await execute('saveCourse',{title:name,term:document.querySelector('#new-course-term')?.value||''});if(result){dialog.close();navigate('library',result.id);}},
    'confirm-rename':async()=>{const name=document.querySelector('#rename-value').value.trim();if(!name)return fieldError('课件名称不能为空。','rename-value');if(await execute('materialNote',{id:ui.menuFile,note:name}))dialog.close();},
    'trash-file':async()=>{if(await execute('trash',{id:ui.menuFile,deleted:true})){dialog.close();notify('课件已移入回收站。');}},
    'restore-file':()=>restore([ui.menuFile]),'restore-focused':()=>restore([ui.focused]),'restore-row':el=>restore([el.dataset.targetFile]),'restore-selected':()=>restore([...ui.selected]),
    'review-selected':batchReview,
    'review-queue':()=>startReview([...ui.selected].map(id=>files.find(file=>file.id===id)).filter(Boolean)),
    'review-pending':()=>startReview(visibleFiles().filter(file=>file.review!=='done')),
    complete:completeReview,
    connect:()=>execute(ui.connected?'logout':'login'),reconnect:()=>execute('login'),
    'login-home':()=>execute('loginControl',{action:'home'}),'login-reload':()=>execute('loginControl',{action:'reload'}),'login-check':async()=>{const found=await execute('loginControl',{action:'check'});if(found===false)notify('尚未检测到完整登录状态，请继续在登录窗口操作。');},
    scan:runScan,
    download:async()=>{const ids=[...ui.scanSelected].filter(id=>!unavailable(id));if(!ids.length)return;const result=await execute('download',{ids,direct:!!ui.scanDirectExport});if(result){ui.scanSelected.clear();navigate('tasks');}},
    pause:el=>execute('task',{id:el.dataset.taskId,action:'toggle'}),'cancel-task':el=>execute('task',{id:el.dataset.taskId,action:'cancel'}),'retry-task':el=>execute('task',{id:el.dataset.taskId,action:'retry'}),
    'open-output':el=>execute('openExport',{id:el.dataset.targetFile}),
    'task-info':el=>{const task=ui.tasks.find(t=>t.id===el.dataset.taskId);if(!task)return;showDialog('任务说明',`<p>${escapeHtml(task.description)}</p>${task.missingPages?.length?`<p>缺失的原始页码：${task.missingPages.map(p=>escapeHtml(typeof p==='object'?p.page:p)).join('、')}</p>`:''}`,button('关闭','close-dialog','','button')+(task.fileId?button('打开课件','open-task','arrow','primary',`data-target-file="${escapeHtml(task.fileId)}"`):''));},
    'auto-save':()=>notify('整理进度始终自动保存，原始页面保留。'),
    'update-check':()=>execute('updatePreferences',{autoCheck:!ui.updateCheck}),
    'export-dir':()=>execute('chooseExportDir'),
    'library-dir':()=>showDialog('切换资料库',`<p>当前资料库：${escapeHtml(snapshot.settings.libraryDir)}</p><p>原目录资料会保留，不会自动搬迁。请先等待后台任务完成。</p>`,button('取消','close-dialog','','button')+button('选择资料库','choose-library','folder','primary')),
    'choose-library':async()=>{dialog.close();await flushPages();await execute('chooseLibrary');},
    'open-library':()=>execute('openLibrary'),
    'save-download-settings':()=>{
      const data={};for(const key of ['timeout','retries','sleepMs']){const input=document.getElementById('setting-'+key);if(!input.checkValidity())return input.reportValidity();data[key]=Number(input.value);}
      return saveSetting(data).then(saved=>{if(saved){ui.downloadDraft={};renderSettings();notify('下载参数已保存。','success');}});
    },
    'reset-update-reminders':()=>execute('updatePreferences',{ignoredVersion:'',remindVersion:'',remindAfter:0}),
    'edit-course':()=>CourseManagement.edit(ui.scope),'manage-course':el=>CourseManagement.edit(el.dataset.courseId),
    'save-course':async()=>{const title=document.getElementById('course-title').value.trim();if(!title)return fieldError('请输入课程名称。','course-title');if(await execute('saveCourse',{id:ui.editCourseId,title,term:document.getElementById('course-term').value.trim()}))dialog.close();},
    'delete-course':()=>CourseManagement.confirm(),
    'confirm-delete-course':async()=>{const mode=dialog.querySelector('[name="course-delete-mode"]:checked').value;if(await execute('scheduleCourseDeletion',{id:ui.editCourseId,mode}))dialog.close();},
    'undo-course-delete':async el=>{if(await execute('undoCourseDeletion',{id:el.dataset.operationId}))notify('已撤销课程删除，课件未作更改。','success');},
    'assign-course':()=>assignDialog([ui.menuFile]),'assign-selected':()=>assignDialog([...ui.selected]),
    'confirm-assign':async()=>{
      let courseId=document.getElementById('assign-course').value||null;
      const title=document.getElementById('assign-new').value.trim();
      if(title){const course=await execute('saveCourse',{title});if(!course)return;courseId=course.id;}
      if(await execute('assignCourse',{ids:ui.assignIds,courseId})){dialog.close();ui.selected.clear();navigate('library',courseId||'unfiled');}
    },
    'help':()=>showDialog('华工课栈 · '+snapshot.appVersion,'<p>资料库用于管理课件，双击课件打开独立标签。单击缩略图预览，双击放大后裁剪。</p><p>整理结果自动保存到本机，原始画面保留。导出应用当前保留页和裁剪结果。</p>',button('检查更新','check-update','refresh','button')+button('关闭','close-dialog','','button')),
  };
  function assignDialog(ids){ui.assignIds=ids;showDialog('归入课程',`<p>将 ${ids.length} 份课件归入课程，保留全部整理记录。</p><label>课程<select id="assign-course"><option value="">未归类</option>${courses.filter(c=>c.id!=='unfiled'&&!c.pending).map(c=>`<option value="${escapeHtml(c.id)}" ${ids.length===1&&files.find(f=>f.id===ids[0])?.course===c.id?'selected':''}>${escapeHtml(c.name)}</option>`).join('')}</select></label><label>或新建课程<input id="assign-new" maxlength="120" placeholder="填写后新建并归入该课程"></label>`,button('取消','close-dialog','','button')+button('保存','confirm-assign','check','primary'));}
  async function importFiles(kind){const courseId=document.querySelector('#import-course').value||null;dialog.close();if(await execute('import',{kind,courseId}))navigate('tasks');}
  function handleAction(name,element){if(!enabled||!handlers[name])return false;Promise.resolve().then(()=>handlers[name](element)).catch(error);return true;}
  async function start(service){
    bridge=service;
    try{
      await bridge.listen('snapshot-changed',next=>{if(!busy)apply(next);else snapshotPending=true;});
      await bridge.listen('task-changed',task=>{
        if(!snapshot)return;const index=snapshot.tasks.findIndex(t=>t.id===task.id);if(index>=0)snapshot.tasks[index]=task;else snapshot.tasks.push(task);
        ui.tasks=snapshot.tasks.map(WorkbenchModel.task);
        if(ui.page==='tasks')renderTasks();
        const trigger=document.querySelector('.navigation [data-page="tasks"]');
        if(trigger){const count=ui.tasks.filter(t=>['queued','running','paused'].includes(t.status)).length;trigger.querySelector('small')?.remove();if(count)trigger.insertAdjacentHTML('beforeend',`<small>${count}</small>`);}
      });
      await bridge.listen('notice',message=>notify(message));
      await refresh();
      if(typeof WorkbenchBulletins!=='undefined')WorkbenchBulletins.start(service);
    }catch(reason){root.innerHTML=`<div class="empty"><h2>资料库打开失败</h2><p>${escapeHtml(reason?.message||String(reason))}</p></div>`;}
  }
  async function prepareClose(){if(!canLeave())return false;if(exporting){notify('正在导出 PDF，请完成后再关闭。');return false;}try{await flushPages();return true;}catch(reason){error(reason);return false;}}
  window.prepareWorkbenchClose=prepareClose;
  return {enabled,start,handleAction,commit,artwork,missing,pageVisited,opened,canLeave,scanRows,unavailable,coursePending,saveSetting,exportDialog,refresh,flushPages,
    startReview,completeReview,reviewContext,endReview:()=>{reviewQueue=[];},
    invalidateScan:()=>{scannedRange=null;scheduleScan();},
    canCrop:file=>fullDimensions.has(file.id+':'+ui.current)||!!KeyePageImages.peek(file.media?.[ui.current-1]?.src),
    get busy(){return busy;},get exporting(){return exporting;},get snapshot(){return snapshot;}};
})();
window.startWorkbench=WorkbenchBusiness.start;
