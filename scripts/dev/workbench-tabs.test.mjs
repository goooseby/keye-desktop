// Run against scripts/inspect.ps1 with /workbench/ open. Uses sample data only.
import assert from 'node:assert/strict';
import {evaluate,screenshot} from './cdp.mjs';

const targets=await(await fetch('http://127.0.0.1:9222/json/list')).json();
const target=targets.find(item=>item.url.includes('/workbench/'));
assert.ok(target,'Open /workbench/ in the development window first.');
const ws=new WebSocket(target.webSocketDebuggerUrl);
await new Promise(resolve=>ws.onopen=resolve);
let sequence=0;
const pending=new Map(),errors=[],checks=[];
ws.onmessage=event=>{
  const message=JSON.parse(event.data);
  if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails.text);
  const job=pending.get(message.id);
  if(job){pending.delete(message.id);message.error?job.reject(Error(JSON.stringify(message.error))):job.resolve(message.result);}
};
const send=(method,params={})=>new Promise((resolve,reject)=>{
  const id=++sequence;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));
});
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const run=expression=>evaluate(`JSON.stringify((()=>{${expression}})())`);
async function check(name,expression){const result=await evaluate(`JSON.stringify(!!(${expression}))`);if(!result)console.log(await run(`return {active:WorkspaceTabs.activeId,focus:document.activeElement.outerHTML,menu:document.querySelector('#tab-menu').matches(':popover-open')};`));assert.equal(result,true,name);checks.push(name);}
const click=async selector=>{
  const rect=await run(`const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};`);
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',...rect});
  await send('Input.dispatchMouseEvent',{type:'mousePressed',...rect,button:'left',clickCount:1});
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',...rect,button:'left',clickCount:1});
  await wait(180);
};
const key=async(key,code,modifiers=0)=>{
  await send('Input.dispatchKeyEvent',{type:'keyDown',key,windowsVirtualKeyCode:code,modifiers});
  await send('Input.dispatchKeyEvent',{type:'keyUp',key,windowsVirtualKeyCode:code,modifiers});
};
try {
  await send('Runtime.enable');await send('Page.reload');await wait(500);
  await send('Emulation.setDeviceMetricsOverride',{width:1100,height:740,deviceScaleFactor:1,mobile:false});
  await check('Starts with a single real library tab',`WorkspaceTabs.count===1&&WorkspaceTabs.activeId==='library'`);
  await run(`WorkspaceTabs.close('library');return true;`);
  await check('Library is pinned',`WorkspaceTabs.count===1&&WorkspaceTabs.activeId==='library'`);
  await run(`openFile('ml9');selectPage(9);mutatePages([5],true);reviewUi.selected=new Set([2,4]);reviewUi.anchor=4;setPageFilter(true);document.querySelector('.review-pages').scrollTop=350;return true;`);
  await run(`openFile('math6');return true;`);
  await check('New document has an independent session',`ui.openFile==='math6'&&ui.current===1&&!ui.onlyKept&&!reviewUi.selected.size`);
  await run(`selectPage(6);reviewUi.selected.add(3);openFile('ml9');return true;`);
  await check('Reopening activates existing tab',`WorkspaceTabs.count===3&&WorkspaceTabs.activeId==='file:ml9'`);
  await check('Document page and filter are restored',`ui.current===9&&ui.onlyKept`);
  await check('Document multi-selection and anchor are restored',`reviewUi.selected.has(2)&&reviewUi.selected.has(4)&&reviewUi.anchor===4`);
  await check('Document scroll is restored',`Math.abs(document.querySelector('.review-pages').scrollTop-350)<1`);
  await run(`openFile('math6');return true;`);
  await check('Other document session remains independent',`ui.current===6&&reviewUi.selected.size===1&&reviewUi.selected.has(3)&&!ui.onlyKept`);
  await run(`navigate('library');ui.selected=new Set(['ml9','math6','net8']);ui.focused='ml8';render();return true;`);
  await wait(260);
  await check('Row background reaches section edge',`Math.abs(document.querySelector('.library-table').getBoundingClientRect().left-document.querySelector('.file-list').getBoundingClientRect().left)<1`);
  await check('Checkbox has space from selected edge',`(()=>{const r=document.querySelector('[data-file=ml9]').getBoundingClientRect(),c=document.querySelector('[data-check=ml9]').getBoundingClientRect();return c.left-r.left>=17})()`);
  await check('Selection does not use a cut-through vertical stripe',`getComputedStyle(document.querySelector('[data-file=ml9]')).boxShadow==='none'`);
  await screenshot('.build/workbench-review/tabs-selection.png');
  await run(`document.querySelector('.table-scroll').scrollTop=220;openFile('net8');navigate('library');return true;`);
  await check('Library selection and detail target survive tab switching',`ui.selected.size===3&&ui.focused==='ml8'`);
  await check('Library scroll survives tab switching',`Math.abs(document.querySelector('.table-scroll').scrollTop-220)<1`);
  await run(`navigate('tasks');ui.tasksFilter='attention';render();navigate('settings');navigate('acquire');navigate('tasks');navigate('settings');navigate('acquire');return true;`);
  await check('Utility pages are singleton tabs',`WorkspaceTabs.count===7&&document.querySelectorAll('[data-tab=tasks]').length===1`);
  await run(`navigate('tasks');return true;`);
  await check('Task filter is retained',`ui.tasksFilter==='attention'`);
  await send('Emulation.setDeviceMetricsOverride',{width:1100,height:480,deviceScaleFactor:1,mobile:false});
  await run(`navigate('settings');document.querySelector('.content').scrollTop=180;window.savedSettingsScroll=document.querySelector('.content').scrollTop;navigate('tasks');navigate('settings');return true;`);
  await check('Settings scroll is retained',`window.savedSettingsScroll>0&&document.querySelector('.content').scrollTop===window.savedSettingsScroll`);
  await send('Emulation.setDeviceMetricsOverride',{width:1100,height:740,deviceScaleFactor:1,mobile:false});
  await run(`WorkspaceTabs.close('file:net8');return true;`);
  await check('Closing inactive document keeps active page',`ui.page==='settings'&&WorkspaceTabs.activeId==='settings'&&WorkspaceTabs.count===6`);
  await run(`openFile('ml9');WorkspaceTabs.close('file:ml9');return true;`);
  await check('Closing active document uses right neighbour',`WorkspaceTabs.activeId==='file:math6'&&ui.current===6`);
  await run(`openFile('ml9');return true;`);
  await check('Reopened document retains edits and last page',`ui.current===9&&currentFile().excluded.has(5)&&currentFile().history.length===1`);
  await check('Closed document starts a fresh viewing session',`!ui.onlyKept&&!reviewUi.selected.size&&document.querySelector('.review-pages').scrollTop===0`);
  await run(`ui.menuFile='ml9';showDialog('操作','');actions['rename-file']();document.querySelector('#rename-value').value='重新命名的课件';actions['confirm-rename']();return true;`);
  await check('Renaming updates existing tab without duplication',`document.querySelector('[data-tab="file:ml9"]').title==='重新命名的课件'&&WorkspaceTabs.count===6`);
  await run(`actions['trash-file']();return true;`);
  await check('Trashing document removes its tab and activates library',`!document.querySelector('[data-tab="file:ml9"]')&&WorkspaceTabs.activeId==='library'`);
  await run(`restoreLibraryFile('ml9');openFile('ml9');return true;`);
  await check('Restored document can reopen with preserved edits',`WorkspaceTabs.activeId==='file:ml9'&&currentFile().excluded.has(5)`);
  await click('[data-action=tab-list]');
  await check('Overflow menu includes every tab',`document.querySelector('#tab-menu').matches(':popover-open')&&document.querySelectorAll('#tab-menu [role=menuitem]').length===WorkspaceTabs.count`);
  await key('Home',36);await key('Enter',13);await wait(200);
  await check('Overflow menu keyboard activates selected tab',`WorkspaceTabs.activeId==='library'&&!document.querySelector('#tab-menu').matches(':popover-open')&&document.activeElement.dataset.tab==='library'`);
  await key('End',35);await wait(200);
  await check('Tab End activates final tab',`WorkspaceTabs.activeId==='file:ml9'`);
  await key('ArrowLeft',37);await wait(200);
  await check('Tab arrow keys activate adjacent tabs',`WorkspaceTabs.activeId==='acquire'`);
  await key('Tab',9,2);await wait(200);
  await check('Ctrl Tab cycles workspace tabs',`WorkspaceTabs.activeId==='file:ml9'`);
  await key('Tab',9,10);await wait(200);
  await check('Ctrl Shift Tab cycles backwards',`WorkspaceTabs.activeId==='acquire'`);
  await key('w',87,2);await wait(200);
  await check('Ctrl W closes current tab',`WorkspaceTabs.activeId==='file:ml9'&&!document.querySelector('.document-tabs [data-tab=acquire]')`);
  await key('Delete',46);await wait(200);
  await check('Delete closes focused document tab',`WorkspaceTabs.activeId==='settings'&&!document.querySelector('.document-tabs [data-tab="file:ml9"]')`);
  await run(`navigate('library');return true;`);
  await click('[data-action=tab-list]');await key('Escape',27);
  await check('Overflow Escape restores trigger focus',`!document.querySelector('#tab-menu').matches(':popover-open')&&document.activeElement.dataset.action==='tab-list'`);
  await run(`navigate('acquire');ui.connected=true;ui.scanned=true;ui.scanRange={start:ui.scanStart,end:ui.scanEnd};ui.scanSelected=new Set(['source-ml']);downloadSelection();WorkspaceTabs.close('tasks');return true;`);
  await wait(650);
  await check('Closing tasks tab does not stop background work',`ui.tasks[0].progress>0&&ui.tasks[0].status==='running'&&!document.querySelector('.document-tabs [data-tab=tasks]')`);
  await run(`navigate('tasks');ui.tasks[0].status='paused';render();return true;`);
  await check('Reopened tasks page shows same job',`ui.tasks.length===1&&!!document.querySelector('[data-task-row="'+ui.tasks[0].id+'"]')`);
  await run(`files.filter(file=>!file.deleted).forEach(file=>openFile(file.id));navigate('settings');return true;`);
  for(const [width,height] of [[1440,900],[1100,740],[900,600],[620,740]]){
    await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
    for(const page of ['library','editor','acquire','tasks','settings']){
      await run(`navigate('${page}');return true;`);await wait(220);
      await check(`No overflow at ${width} on ${page}`,`document.documentElement.scrollWidth<=innerWidth&&document.querySelector('.workspace').scrollWidth<=document.querySelector('.workspace').clientWidth`);
      await check(`Active tab visible at ${width} on ${page}`,`(()=>{const a=document.querySelector('.document-tab-slot.active').getBoundingClientRect(),b=document.querySelector('.document-tabs').getBoundingClientRect();return a.left>=b.left-1&&a.right<=b.right+1})()`);
      if(page==='editor'&&(width===1100||width===620))await screenshot('.build/workbench-review/tabs-editor-'+width+'.png');
    }
    await click('[data-action=tab-list]');
    await check(`Overflow menu fits at ${width}`,`(()=>{const r=document.querySelector('#tab-menu').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight})()`);
    if(width===620)await screenshot('.build/workbench-review/tabs-overflow-620.png');
    await key('Escape',27);
  }
  assert.deepEqual(errors,[],'No browser exceptions');
  console.log(JSON.stringify({passed:checks.length,errors,checks},null,2));
} finally {
  await send('Emulation.clearDeviceMetricsOverride');await send('Page.reload');await wait(300);ws.close();
}
