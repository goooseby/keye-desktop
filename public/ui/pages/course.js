'use strict';

// 课程页：课次列表、批量选择与导出，以及课程信息维护。

function visibleSessions(){return sessions(view.courseId).filter(m=>(view.courseFilter!=='pending'||!reviewed(m))&&(!view.courseFrom||m.day>=view.courseFrom)&&(!view.courseTo||m.day<=view.courseTo));}
function selectedSessions(){return sessions(view.courseId).filter(m=>view.courseSelected.has(m.id));}
function renderCourse(){
  const c=courseById(view.courseId),all=sessions(view.courseId),rows=visibleSessions();
  const pending=all.filter(m=>!reviewed(m)).length;
  const selected=selectedSessions();
  main.innerHTML=`<button class="back-button" data-nav="library">${icon('left')}返回资料库</button><div class="page-heading"><div><div class="eyebrow">COURSE COLLECTION</div><h1>${esc(c.title)}</h1><p class="subtitle">${esc(c.term||'学期未设置')} · ${all.length} 份课件 · ${pending} 份待整理</p></div><div class="actions">${c.id!=='unfiled'?'<button data-course-action="edit">课程信息</button>':''}<button data-action="import">导入文件</button><button class="primary" data-course-action="pending" ${pending?'':'disabled'}>整理待整理课件</button></div></div>
  ${c.id==='unfiled'?'<p class="helper-note">这里包含本地导入或暂未确认课程归属的旧课件。选中后可归入课程；平台旧课件也可在重新扫描匹配后自动归类。</p>':''}
  <div class="course-controls"><select class="field-input" id="course-filter"><option value="all">全部课次</option><option value="pending" ${view.courseFilter==='pending'?'selected':''}>仅待整理</option></select><label>从 <input type="date" id="course-from" value="${view.courseFrom}"></label><label>至 <input type="date" id="course-to" value="${view.courseTo}"></label><button data-course-action="recent">选择最近 3 份</button><button data-course-action="visible">选择当前结果</button><button data-course-action="clear">清空选择</button></div>
  <div class="course-batch"><span>已选 ${selected.length} 份 · 保留 ${selected.reduce((n,m)=>n+m.pages-m.excluded.length,0)} 页 <small>无需先标记已整理</small></span><div class="actions"><button data-course-action="assign" ${selected.length?'':'disabled'}>归入课程</button><button data-course-action="batch" ${selected.length?'':'disabled'}>更多导出方式</button><button data-course-action="quick-batch" class="primary" ${selected.length?'':'disabled'}>${icon('export')}快速导出选中</button><button data-course-action="selected" ${selected.length?'':'disabled'}>整理选中</button></div></div>
  ${rows.length?`<div class="table-wrap session-table"><table><thead><tr><th></th><th>上课日期 / 课件</th><th>保留页面</th><th>整理状态</th><th>导出状态</th><th>课件操作</th></tr></thead><tbody>${rows.map(m=>`<tr class="session-row"><td><input type="checkbox" data-session-select="${m.id}" ${view.courseSelected.has(m.id)?'checked':''} aria-label="选择 ${esc(m.day)} 课件"></td><td class="session-entry" data-course-session="${m.id}"><button class="session-title" data-course-session="${m.id}"><span class="session-title-main"><strong>${esc(m.day)}</strong><span>${esc(m.note|| (m.source==='import'?m.title:'课堂课件'))}</span></span><small>${m.lectureId?'课次 '+esc(m.lectureId):m.source==='import'?'本地资料':'平台课件'}</small></button></td><td data-course-session="${m.id}">${m.pages-m.excluded.length} / ${m.pages}${cropCount(m)?` <small class="crop-flag" title="已裁剪页面">${icon('crop')}${cropCount(m)}</small>`:''}</td><td data-course-session="${m.id}">${badge(m)}</td><td data-course-session="${m.id}">${exportBadge(m)}</td><td class="session-action-cell"><div class="session-actions"><button data-quick-export="${m.id}" title="直接保存到默认导出目录">快速导出</button><button data-note="${m.id}" title="编辑内容备注">备注</button><button class="icon-button session-more ${view.sessionMenuId===m.id?'active':''}" data-session-menu="${m.id}" aria-label="更多课件操作" aria-expanded="${view.sessionMenuId===m.id}">${icon('more')}</button>${view.sessionMenuId===m.id?`<div class="session-menu" role="menu"><button data-mark-reviewed="${m.id}" ${reviewed(m)?'disabled':''}>${icon('check')}${reviewed(m)?'已标记为已整理':'标记为已整理'}</button><button class="danger" data-delete-session="${m.id}">${icon('trash')}移入回收站</button></div>`:''}</div></td></tr>`).join('')}</tbody></table></div>`:empty('没有符合条件的课件','调整日期范围，或从获取课件页面添加资料。')}`;
}

async function startReview(items){
  if(!items.length)return toast('没有需要整理的课件。');
  await call('reviewQueue',{ids:items.map(m=>m.id)});openMaterial(items[0].id);
}
async function courseClick(b){
  if(!b)return false;
  if(b.dataset.sessionMenu){view.sessionMenuId=view.sessionMenuId===b.dataset.sessionMenu?null:b.dataset.sessionMenu;renderCourse();requestAnimationFrame(()=>main.querySelector(`[data-session-menu="${b.dataset.sessionMenu}"]`)?.focus());return true;}
  if(b.dataset.markReviewed){const m=state.materials.find(m=>m.id===b.dataset.markReviewed);view.sessionMenuId=null;await call('reviewed',{id:m.id,revision:m.revision});toast('已标记为已整理');return true;}
  if(b.dataset.deleteSession){view.sessionMenuId=null;await call('trash',{id:b.dataset.deleteSession,deleted:true});toast('已移入回收站，可随时恢复');return true;}
  if(b.dataset.scanExpand){const id=b.dataset.scanExpand;view.scanExpanded.has(id)?view.scanExpanded.delete(id):view.scanExpanded.add(id);renderAcquire();return true;}
  if(b.dataset.courseSession){await startReview([state.materials.find(m=>m.id===b.dataset.courseSession)]);return true;}
  if(b.dataset.quickExport){await submitExport('quickExport',{id:b.dataset.quickExport},'PDF 导出完成，可在任务页打开输出目录。');return true;}
  if(b.dataset.note){const m=state.materials.find(m=>m.id===b.dataset.note);showModal('课件备注',`<p>${esc(m.day)} · ${esc(m.title)}</p><label class="field">内容备注<input id="session-note" type="text" maxlength="120" value="${esc(m.note||'')}" placeholder="例如：线性规划的图解法"></label>`,`<button data-action="close-modal">取消</button><button class="primary" data-save-note="${m.id}">保存</button>`);return true;}
  if(b.dataset.saveNote){await call('materialNote',{id:b.dataset.saveNote,note:$('#session-note').value});closeModal();return true;}
  const action=b.dataset.courseAction;if(!action)return false;
  if(view.saving){toast('正在保存，请稍候。');return true;}
  if(action==='new'||action==='edit'){
    const c=action==='edit'?courseById(view.courseId):{title:'',term:''};
    showModal(action==='new'?'新建课程':'课程信息',`<label class="field">课程名称<input id="course-title" type="text" maxlength="120" value="${esc(c.title)}"></label><label class="field">学期 / 班级（选填）<input id="course-term" type="text" maxlength="80" value="${esc(c.term)}" placeholder="例如：2026 秋季 · 1 班"></label>`,`<button data-action="close-modal">取消</button><button class="primary" data-course-action="save" ${c.id?`data-course-id="${c.id}"`:''}>保存课程</button>`);
  }else if(action==='save'){
    const c=await call('saveCourse',{id:b.dataset.courseId,title:$('#course-title').value,term:$('#course-term').value});closeModal();navigate('course/'+c.id);
  }else if(action==='pending')await startReview(sessions(view.courseId).filter(m=>!reviewed(m)));
  else if(action==='selected')await startReview(selectedSessions());
  else if(action==='complete'){
    const m=material(),q=queueMaterials(),items=q.some(x=>x.id===m.id)?q:sessions(m.courseId||'unfiled'),index=items.findIndex(x=>x.id===m.id);
    view.saving=true;renderEditor();
    try{await call('reviewed',{id:m.id,revision:m.revision});}finally{view.saving=false;render();}
    if(index<items.length-1)openMaterial(items[index+1].id);else{await call('reviewQueue',{ids:[]});navigate('course/'+(m.courseId||'unfiled'));toast('本次范围已处理完成');}
  }else if(['recent','visible','clear'].includes(action)){
    view.courseSelected=new Set((action==='clear'?[]:action==='recent'?sessions(view.courseId).slice(-3):visibleSessions()).map(m=>m.id));renderCourse();
  }else if(action==='assign'){
    showModal('归入课程',`<p>将选中的 ${selectedSessions().length} 份课件归入课程，页面整理记录保留。</p><label class="field">已有课程<select id="assign-course" class="field-input"><option value="">未归类</option>${(state.courseLibrary||[]).map(c=>`<option value="${c.id}">${esc(c.title)} · ${esc(c.term)}</option>`).join('')}</select></label><label class="field">或新建课程<input id="assign-new" type="text" maxlength="120" placeholder="填写后将新建并归入该课程"></label>`,'<button data-action="close-modal">取消</button><button class="primary" data-course-action="confirm-assign">确认归入</button>');
  }else if(action==='confirm-assign'){
    let id=$('#assign-course').value;const title=$('#assign-new').value.trim();if(title)id=(await call('saveCourse',{title})).id;
    await call('assignCourse',{ids:selectedSessions().map(m=>m.id),courseId:id||null});view.courseSelected.clear();closeModal();navigate('course/'+(id||'unfiled'));
  }else if(action==='batch'){
    const items=selectedSessions(),pages=items.reduce((n,m)=>n+m.pages-m.excluded.length,0),pending=items.filter(m=>!reviewed(m)).length;
    showModal('导出选中课件',`<p>按上课日期顺序，导出 ${items.length} 份课件，共 ${pages} 页。</p>${pending?`<div class="notice">其中 ${pending} 份尚未确认整理完成，将使用当前保留的页面。</div>`:''}<label class="field">导出方式<select id="batch-mode" class="field-input"><option value="separate">分别导出，按课程保存到文件夹</option><option value="combined">合并为一个 PDF，按课次添加书签</option></select></label><p>分别导出时，已完成的文件会保留；取消或重试不会覆盖这些文件。</p>`,'<button data-action="close-modal">取消</button><button class="primary" data-course-action="confirm-batch">选择位置并导出</button>');
  }else if(action==='confirm-batch'){
    const mode=$('#batch-mode').value,ids=selectedSessions().map(m=>m.id);closeModal();if(await submitExport('batchExport',{ids,mode},'选中课件已导出完成。'))navigate('tasks');
  }else if(action==='quick-batch'){
    if(await submitExport('batchExport',{ids:selectedSessions().map(m=>m.id),mode:'separate',quick:true},'选中课件已快速导出完成。'))navigate('tasks');
  }
  return true;
}
function courseChange(el){
  if(el.dataset.sessionSelect){el.checked?view.courseSelected.add(el.dataset.sessionSelect):view.courseSelected.delete(el.dataset.sessionSelect);renderCourse();return true;}
  const fields={'course-filter':'courseFilter','course-from':'courseFrom','course-to':'courseTo'};
  if(fields[el.id]){view[fields[el.id]]=el.value;renderCourse();return true;}
  return false;
}

