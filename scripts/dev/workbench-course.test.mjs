import fs from 'node:fs';
import assert from 'node:assert/strict';
process.env.KEYE_DEBUG_PORT='9223';
const {evaluate,screenshot}=await import('./cdp.mjs');
const path='.build/workbench-review/course-report.json';
const resume=process.argv.includes('--resume');
const target=(await(await fetch('http://127.0.0.1:9223/json/list')).json()).find(t=>t.url.includes('5173'));
const ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise(resolve=>ws.onopen=resolve);
let sequence=0;const pending=new Map(),errors=[];
ws.onmessage=event=>{const m=JSON.parse(event.data);if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text);if(pending.has(m.id)){pending.get(m.id)(m.result);pending.delete(m.id);}};
const send=(method,params={})=>new Promise(resolve=>{const id=++sequence;pending.set(id,resolve);ws.send(JSON.stringify({id,method,params}));});
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const run=code=>evaluate(`(async()=>{${code}})()`);
const checks=[];
async function check(name,expression){assert.equal(await evaluate(`JSON.stringify(!!(${expression}))`),true,name);checks.push(name);}
async function click(selector){const r=await evaluate(`JSON.stringify((()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})())`);await send('Input.dispatchMouseEvent',{type:'mouseMoved',...r});await wait(160);await send('Input.dispatchMouseEvent',{type:'mousePressed',...r,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',...r,button:'left',clickCount:1});await wait(200);}
async function settle(){await run(`await new Promise(r=>setTimeout(r,100));while(WorkbenchBusiness.busy)await new Promise(r=>setTimeout(r,25));return JSON.stringify(true)`);}
try{
  await send('Runtime.enable');await send('Page.reload');await wait(700);
  await check('course tests use isolated library',`WorkbenchBusiness.snapshot.settings.libraryDir.includes('workbench-qa-')`);
  if(resume){
    const report=JSON.parse(fs.readFileSync(path,'utf8'));
    await run(`const end=Date.now()+11000;while(Date.now()<end&&courses.some(course=>course.id===${JSON.stringify(report.restart.courseId)}))await new Promise(r=>setTimeout(r,100));return JSON.stringify(true)`);
    await check('pending course deletion resumes after application restart',`!courses.some(course=>course.id===${JSON.stringify(report.restart.courseId)})&&!(WorkbenchBusiness.snapshot.pendingCourseDeletions||[]).some(op=>op.courseId===${JSON.stringify(report.restart.courseId)})`);
    report.checks.push(...checks);report.errors.push(...errors);fs.writeFileSync(path,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
  }else{
    await send('Emulation.setDeviceMetricsOverride',{width:1100,height:740,deviceScaleFactor:1,mobile:false});
    await run(`window.courseTest={file:files.find(file=>!file.deleted).id,other:files.filter(file=>!file.deleted)[1].id};dispatchAction('new-course');document.getElementById('new-course-name').value='可撤销课程';document.getElementById('new-course-term').value='测试学期';dispatchAction('create-course');return JSON.stringify(true)`);await settle();
    await run(`courseTest.course=courses.find(c=>c.name==='可撤销课程').id;return JSON.stringify(true)`);
    const id=await evaluate('JSON.stringify(courseTest.course)');
    const selector=`.course-nav-row [data-course-id="${id}"]`;
    const row=await evaluate(`JSON.stringify((()=>{const r=document.querySelector('[data-scope="'+courseTest.course+'"]').getBoundingClientRect();return {x:r.x+40,y:r.y+r.height/2}})())`);
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',...row});await wait(180);
    await check('hover reveals course management without changing the selected scope',`getComputedStyle(document.querySelector('.course-more[data-course-id="'+courseTest.course+'"]')).visibility==='visible'&&ui.scope===courseTest.course`);
    await click(selector);
    await check('course dialog edits the clicked course',`dialog.open&&document.getElementById('course-title').value==='可撤销课程'&&ui.editCourseId===courseTest.course`);
    await run(`document.getElementById('course-title').value='课程管理检查';dispatchAction('save-course');return JSON.stringify(true)`);await settle();
    await check('course rename persists without changing identity',`courses.find(c=>c.id===courseTest.course).name==='课程管理检查'`);
    await run(`await window.__TAURI_INTERNALS__.invoke('request',{command:'assignCourse',data:{ids:[courseTest.file],courseId:courseTest.course}});await WorkbenchBusiness.refresh();openFile(courseTest.file);courseTest.before=JSON.parse(JSON.stringify(currentFile().raw));return JSON.stringify(true)`);
    await click(selector);await click('[data-action="delete-course"]');
    await check('delete requires an explicit material handling choice and confirmation',`dialog.open&&document.querySelectorAll('[name="course-delete-mode"]').length===2&&document.querySelector('[name="course-delete-mode"]:checked').value==='unfiled'`);
    await check('delete choices keep radio controls compact beside their labels',`[...document.querySelectorAll('.course-delete-option')].every(row=>{const r=row.getBoundingClientRect(),i=row.querySelector('input').getBoundingClientRect(),s=row.querySelector('span').getBoundingClientRect();return i.width<=16&&i.left-r.left<20&&s.left-i.right>=8&&s.left-i.right<=12})`);
    await run(`actions['close-dialog']();return JSON.stringify(true)`);
    await check('cancelling confirmation leaves the course intact',`courses.some(c=>c.id===courseTest.course&&!c.pending)&&!(WorkbenchBusiness.snapshot.pendingCourseDeletions||[]).length`);
    await click(selector);await click('[data-action="delete-course"]');await click('[data-action="confirm-delete-course"]');await settle();
    await check('pending course is hidden and undo banner is visible',`!document.querySelector('.course-link[data-scope="'+courseTest.course+'"]')&&!!document.querySelector('.course-undo-bar')`);
    await check('grace period does not change any material state',`currentFile().raw.courseId===courseTest.course&&!currentFile().deleted&&JSON.stringify(currentFile().raw.crops)===JSON.stringify(courseTest.before.crops)`);
    await screenshot('.build/workbench-review/course-undo-banner.png');
    await click('[data-action="undo-course-delete"]');await settle();
    await check('undo restores course visibility without touching material edits',`!!document.querySelector('.course-link[data-scope="'+courseTest.course+'"]')&&!document.querySelector('.course-undo-bar')&&currentFile().raw.courseId===courseTest.course&&JSON.stringify(currentFile().raw.crops)===JSON.stringify(courseTest.before.crops)`);
    await click(selector);await click('[data-action="delete-course"]');await click('[data-action="confirm-delete-course"]');await settle();
    await run(`const end=Date.now()+11000;while(Date.now()<end&&courses.some(c=>c.id===courseTest.course))await new Promise(r=>setTimeout(r,100));return JSON.stringify(true)`);
    await check('deadline deletes course and moves material to unfiled',`!courses.some(c=>c.id===courseTest.course)&&currentFile().course==='unfiled'&&!currentFile().deleted&&JSON.stringify(currentFile().raw.crops)===JSON.stringify(courseTest.before.crops)&&!document.querySelector('.course-undo-bar')`);
    await run(`dispatchAction('new-course');document.getElementById('new-course-name').value='回收站处理检查';dispatchAction('create-course');return JSON.stringify(true)`);await settle();
    await run(`courseTest.trashCourse=courses.find(c=>c.name==='回收站处理检查').id;await window.__TAURI_INTERNALS__.invoke('request',{command:'assignCourse',data:{ids:[courseTest.file],courseId:courseTest.trashCourse}});await WorkbenchBusiness.refresh();openFile(courseTest.other);openFile(courseTest.file);CourseManagement.edit(courseTest.trashCourse);return JSON.stringify(true)`);
    await click('[data-action="delete-course"]');await click('[name="course-delete-mode"][value="trash"]');
    await screenshot('.build/workbench-review/course-delete-confirm.png');await click('[data-action="confirm-delete-course"]');await settle();
    await run(`const end=Date.now()+11000;while(Date.now()<end&&courses.some(c=>c.id===courseTest.trashCourse))await new Promise(r=>setTimeout(r,100));return JSON.stringify(true)`);
    await check('trash choice closes only affected document tabs',`files.find(f=>f.id===courseTest.file).deleted&&!document.querySelector('.document-tabs [data-tab="file:'+courseTest.file+'"]')&&!!document.querySelector('.document-tabs [data-tab="file:'+courseTest.other+'"]')`);
    await run(`ui.menuFile=courseTest.file;dispatchAction('restore-file');return JSON.stringify(true)`);await settle();
    await check('restoring course-deleted materials retains crops in unfiled',`!files.find(f=>f.id===courseTest.file).deleted&&files.find(f=>f.id===courseTest.file).course==='unfiled'&&JSON.stringify(files.find(f=>f.id===courseTest.file).raw.crops)===JSON.stringify(courseTest.before.crops)`);
    await check('unfiled is a protected virtual category',`!document.querySelector('.course-more[data-course-id="unfiled"]')`);
    const output=await evaluate('JSON.stringify(courseTest.before.exportPath)');if(output)assert.ok(fs.existsSync(output),'Previously exported PDF remains');
    await run(`dispatchAction('new-course');document.getElementById('new-course-name').value='重启恢复计划';dispatchAction('create-course');return JSON.stringify(true)`);await settle();
    const restart=await run(`const course=courses.find(c=>c.name==='重启恢复计划');const operation=await window.__TAURI_INTERNALS__.invoke('request',{command:'scheduleCourseDeletion',data:{id:course.id,mode:'unfiled'}});return JSON.stringify({courseId:course.id,expiresAt:operation.expiresAt})`);
    const report={checks,errors,restart};fs.writeFileSync(path,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
  }
  assert.deepEqual(errors,[]);
}finally{await send('Emulation.clearDeviceMetricsOverride');ws.close();}
