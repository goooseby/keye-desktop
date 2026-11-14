import fs from 'node:fs';
import assert from 'node:assert/strict';
process.env.KEYE_DEBUG_PORT='9223';
const {evaluate,screenshot}=await import('./cdp.mjs');
const target=(await(await fetch('http://127.0.0.1:9223/json/list')).json()).find(t=>t.url.includes('5173'));
const socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise(resolve=>socket.onopen=resolve);
let sequence=0;const pending=new Map(),errors=[],checks=[];
socket.onmessage=event=>{const m=JSON.parse(event.data);if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text);if(pending.has(m.id)){pending.get(m.id)(m.result);pending.delete(m.id);}};
const send=(method,params={})=>new Promise(resolve=>{const id=++sequence;pending.set(id,resolve);socket.send(JSON.stringify({id,method,params}));});
const run=code=>evaluate('(async()=>{'+code+'})()');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function check(name,expression){assert.equal(await evaluate('JSON.stringify(!!('+expression+'))'),true,name);checks.push(name);}
try {
  await send('Runtime.enable');await send('Page.reload');await wait(700);
  await check('announcement writes use isolated development data','WorkbenchBusiness.snapshot.settings.libraryDir.includes("workbench-qa-")');
  await run('WorkbenchBulletins.show("school-network-20261114:1");await WorkbenchBulletins.refresh(true);return JSON.stringify(true)');
  await check('real HTTPS desktop announcement endpoint is connected','document.querySelector(".bulletin-body h3").textContent==="学校平台访问提示"');
  await run('document.querySelector("[data-bulletin=read]").click();await new Promise(r=>setTimeout(r,300));return JSON.stringify(true)');
  await check('reading acknowledgement is saved through native command','document.querySelector(".bulletin-footer-copy").textContent==="已阅读"');
  await send('Page.reload');await wait(700);
  await run('WorkbenchBulletins.show("school-network-20261114:1");await WorkbenchBulletins.refresh(true);return JSON.stringify(true)');
  await check('read receipt survives application reload','document.querySelector(".bulletin-date").textContent.includes("已阅读")');
  await run('document.querySelector("[data-bulletin=close]").click();return JSON.stringify(true)');
  // UI-only update fixture: never download an actual package or install anything.
  await run('window.bulletinTest={calls:[],offline:false,items:[{key:"demo:1",id:"demo",revision:1,kind:"general",title:"课堂资料与使用提示",body:"**课堂之后，仍可继续整理。**\\n\\n- 原始课件保留在本机，整理和导出可离线进行。\\n- 公告与版本更新集中展示，不打断当前工作。\\n\\n<img src=x onerror=alert(1)>",publishedAt:"2026-11-14T12:00:00+08:00",read:false,expired:false,remindAfter:0}]};WorkbenchBusiness.snapshot.packaged=true;document.hasFocus=()=>true;WorkbenchBulletins.start({call:async(command,data={})=>{bulletinTest.calls.push({command,data});if(command==="announcements")return {items:bulletinTest.items,autoShow:true,error:bulletinTest.offline?"测试离线：已保留缓存":null};if(command==="checkUpdate"){if(bulletinTest.offline)throw Error("offline");return {available:true,latest:"0.6.0",notes:"**更顺畅的工作台**\\n\\n- 改善课件整理与预览。\\n- 保留原始资料与整理记录。"};}if(command==="announcementReceipt"){const item=bulletinTest.items.find(i=>i.key===data.key);if(item){if(data.action==="read")item.read=true;else item.remindAfter=Date.now()+86400000;}return {items:bulletinTest.items,autoShow:true};}if(command==="downloadUpdate")throw Error("测试下载失败：请重试");if(command==="installUpdate")throw Error("Tests must never install");return true;}});openFile(files.find(f=>!f.deleted).id);await WorkbenchBulletins.refresh(false);return JSON.stringify(true)');
  await wait(1700);
  await check('automatic announcement waits while editing','!document.querySelector("#bulletin-dialog").open');
  await run('navigate("library");return JSON.stringify(true)');await wait(1700);
  await check('one automatic window prioritizes update','document.querySelector("#bulletin-dialog").open&&document.querySelector(".bulletin-body h3").textContent.includes("0.6.0")');
  await send('Emulation.setDeviceMetricsOverride',{width:1100,height:740,deviceScaleFactor:1,mobile:false});await wait(200);
  await screenshot('.build/workbench-review/announcements-update.png');
  await run('document.querySelector("[data-bulletin=download]").click();await new Promise(r=>setTimeout(r,100));return JSON.stringify(true)');
  await check('failed download is retryable in the same window','document.querySelector(".bulletin-status").textContent.includes("测试下载失败")&&!document.querySelector("[data-bulletin=download]").disabled');
  await run('document.querySelectorAll("[data-bulletin=select]")[1].click();return JSON.stringify(true)');
  await check('remote body never inserts HTML','!document.querySelector(".bulletin-prose img")&&document.querySelector(".bulletin-prose").textContent.includes("<img")');
  await run('bulletinTest.items[0].body=bulletinTest.items[0].body.split("<img")[0];await WorkbenchBulletins.refresh(true);return JSON.stringify(true)');
  for(const width of [1100,900,620]){
    await send('Emulation.setDeviceMetricsOverride',{width,height:740,deviceScaleFactor:1,mobile:false});await wait(150);
    await check('announcement fits '+width,'(()=>{const d=document.querySelector("#bulletin-dialog"),r=d.getBoundingClientRect(),body=d.querySelector(".bulletin-body");return r.left>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight&&body.clientWidth>200&&d.scrollWidth<=d.clientWidth+1})()');
    await screenshot('.build/workbench-review/announcements-'+width+'.png');
  }
  await run('bulletinTest.offline=true;await WorkbenchBulletins.refresh(true);return JSON.stringify(true)');
  await check('offline refresh retains cached content','document.querySelector(".bulletin-body h3").textContent==="课堂资料与使用提示"&&document.querySelector(".bulletin-status").textContent.length>0');
  await run('document.querySelector("[data-bulletin=close]").click();return JSON.stringify(true)');await wait(1800);
  await check('startup does not repeat automatic windows','!document.querySelector("#bulletin-dialog").open');
  await run('openFile(files.find(f=>!f.deleted).id);WorkbenchBulletins.show("demo:1");window.bulletinPage=ui.current;return JSON.stringify(true)');
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',windowsVirtualKeyCode:39});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowRight',windowsVirtualKeyCode:39});
  await check('announcement keyboard cannot flip the document underneath','ui.current===bulletinPage');
  await send('Input.dispatchMouseEvent',{type:'mousePressed',x:5,y:5,button:'left',clickCount:1});
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:5,y:5,button:'left',clickCount:1});await wait(150);
  await check('clicking the backdrop closes a manually opened announcement','!document.querySelector("#bulletin-dialog").open');
  assert.deepEqual(errors,[]);const report={checks,errors,network:'real desktop feed; update UI fixture only; no installation'};
  fs.writeFileSync('.build/workbench-review/bulletins-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
} finally {await send('Emulation.clearDeviceMetricsOverride');socket.close();}
