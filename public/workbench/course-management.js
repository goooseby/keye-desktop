'use strict';

const CourseManagement = (() => {
  const demoPending=[];
  let ticker=null;
  const pending=()=>WorkbenchBusiness.enabled?WorkbenchBusiness.snapshot?.pendingCourseDeletions||[]:demoPending;
  function edit(id){
    const course=courses.find(course=>course.id===id&&course.id!=='unfiled');
    if(!course||course.pending)return notify('课程已删除或待删除，请先撤销删除。');
    ui.editCourseId=id;
    showDialog('课程信息',`<label>课程名称<input id="course-title" maxlength="120" value="${escapeHtml(course.name)}"></label><label>学期 / 班级<input id="course-term" maxlength="80" value="${escapeHtml(course.term||'')}"></label>`,button('删除课程','delete-course','trash','danger-button')+'<span class="spacer"></span>'+button('取消','close-dialog','','button')+button('保存','save-course','check','primary'));
  }
  function confirm(){
    const course=courses.find(course=>course.id===ui.editCourseId);if(!course||course.id==='unfiled')return;
    const materials=files.filter(file=>file.course===course.id),active=materials.filter(file=>!file.deleted).length;
    showDialog('删除课程',`<p>删除「<strong>${escapeHtml(course.name)}</strong>」？课程内有 ${active} 份课件${materials.length-active?'，另有 '+(materials.length-active)+' 份在回收站':''}。</p><fieldset class="course-delete-options"><legend>课程内的课件如何处理</legend><label class="course-delete-option"><input type="radio" name="course-delete-mode" value="unfiled" checked><span><strong>移到未归类</strong><small>保留课件、裁剪和整理记录，之后可重新归入课程。</small></span></label><label class="course-delete-option"><input type="radio" name="course-delete-mode" value="trash"><span><strong>移入回收站</strong><small>课件仍可恢复，原始文件和已导出的 PDF 保留。</small></span></label></fieldset><p class="course-delete-note">确认后有约 8 秒可撤销，期间不会改动课件。关闭应用也会保留待删除计划。</p>`,button('取消','close-dialog','','button')+button('确认删除','confirm-delete-course','trash','danger-primary'));
  }
  function banner(){
    const operations=pending();
    if(!operations.length)return '';
    return `<div class="course-undo-stack" aria-label="待删除课程">${operations.map(op=>`<div class="course-undo-bar" role="status">${icon('clock')}<span>「${escapeHtml(op.title)}」待删除<span class="undo-mode"> · 课件${op.mode==='trash'?'移入回收站':'移至未归类'}</span></span><small data-course-countdown="${escapeHtml(op.id)}"></small><span class="spacer"></span>${button('撤销','undo-course-delete','undo','',`data-operation-id="${escapeHtml(op.id)}" aria-label="撤销删除课程 ${escapeHtml(op.title)}"`)}</div>`).join('')}</div>`;
  }
  function syncTimer(){
    const tick=()=>{
      const operations=pending();
      document.querySelectorAll('[data-course-countdown]').forEach(label=>{const op=operations.find(op=>op.id===label.dataset.courseCountdown);if(op){const seconds=Math.max(0,Math.ceil((op.expiresAt-Date.now())/1000));label.textContent=seconds?`${seconds} 秒`:'正在处理…';}});
    };
    if(pending().length){if(!ticker)ticker=setInterval(tick,500);tick();}else{clearInterval(ticker);ticker=null;}
  }
  function simulateDelete(){
    const course=courses.find(c=>c.id===ui.editCourseId);if(!course||course.pending)return;
    const mode=dialog.querySelector('[name="course-delete-mode"]:checked').value;
    const op={id:'delete-'+Date.now(),courseId:course.id,title:course.name,mode,expiresAt:Date.now()+8000};
    demoPending.push(op);course.pending=true;dialog.close();if(ui.scope===course.id)ui.scope='all';render();
    setTimeout(()=>{
      const index=demoPending.findIndex(item=>item.id===op.id);if(index<0)return;
      files.filter(file=>file.course===op.courseId).forEach(file=>{file.course='unfiled';if(mode==='trash')file.deleted=true;});
      if(!courses.some(c=>c.id==='unfiled'))courses.push({id:'unfiled',name:'未归类',color:'#657286'});
      const courseIndex=courses.findIndex(c=>c.id===op.courseId);if(courseIndex>=0)courses.splice(courseIndex,1);
      demoPending.splice(index,1);WorkspaceTabs.reconcile(new Set(files.filter(f=>!f.deleted).map(f=>f.id)));render();notify('课程已删除，课件已'+(mode==='trash'?'移入回收站。':'移至未归类。'));
    },8000);
  }
  function simulateUndo(id){const index=demoPending.findIndex(op=>op.id===id);if(index<0)return;const [op]=demoPending.splice(index,1);const course=courses.find(c=>c.id===op.courseId);if(course)course.pending=false;render();}
  function simulateSave(){const course=courses.find(c=>c.id===ui.editCourseId),name=document.getElementById('course-title').value.trim();if(!name)return fieldError('请输入课程名称。','course-title');if(course){course.name=name;course.term=document.getElementById('course-term').value.trim();dialog.close();render();}}
  return {edit,confirm,banner,syncTimer,simulateDelete,simulateUndo,simulateSave};
})();
