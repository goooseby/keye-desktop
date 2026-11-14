// Capture only disposable sample UI. Never stage downloaded materials or account data.
import fs from 'node:fs';
import {evaluate,screenshot} from './cdp.mjs';
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const run=body=>evaluate('JSON.stringify((()=>{'+body+'})())');
const target=(await(await fetch('http://127.0.0.1:9222/json/list')).json()).find(t=>t.url.includes('5173'));
const socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise(resolve=>socket.onopen=resolve);
let sequence=0;const pending=new Map();
socket.onmessage=event=>{const m=JSON.parse(event.data);if(pending.has(m.id)){pending.get(m.id)(m.result);pending.delete(m.id);}};
const send=(method,params={})=>new Promise(resolve=>{const id=++sequence;pending.set(id,resolve);socket.send(JSON.stringify({id,method,params}));});
try {
  if(await run('return WorkbenchBusiness.enabled&&(WorkbenchBusiness.busy||!!ui.crop);'))throw Error('开发窗口有未完成修改，请先保存。');
  await send('Page.navigate',{url:'http://127.0.0.1:5173/workbench/'});await wait(600);
  await send('Emulation.setDeviceMetricsOverride',{width:1100,height:740,deviceScaleFactor:1,mobile:false});
  await wait(200);
  fs.mkdirSync('docs/screenshots',{recursive:true});
  await screenshot('docs/screenshots/library.png');
  await run('navigate("library","ml");return true;');await wait(250);
  await screenshot('docs/screenshots/course.png');
  await run('ui.connected=true;ui.scanned=true;ui.scanStart="2026-11-09";ui.scanEnd="2026-11-14";ui.scanRange={start:ui.scanStart,end:ui.scanEnd};sourceRows=()=>courses.flatMap((course,index)=>[0,1].map(n=>({id:"demo-"+course.id+"-"+n,course:course.id,name:course.name,title:course.name,date:"2026-11-"+(13-index-n),sub_id:n+1,pages:32+n*4})));ui.scanExpanded=new Set([courses[0].id]);ui.scanSelected=new Set(["demo-ml-0","demo-ml-1"]);navigate("acquire");return true;');await wait(250);
  await screenshot('docs/screenshots/acquire.png');
  await run('openFile("math6");openFile("ml9");selectPage(3);return true;');await wait(300);
  await screenshot('docs/screenshots/editor.png');
  await run('showViewer();cropAction();ui.crop={x:.03,y:.025,w:.94,h:.88};renderViewer();return true;');await wait(300);
  await screenshot('docs/screenshots/crop.png');
  console.log('Captured five sample-only screenshots for the renamed desktop workbench.');
} finally {
  await send('Emulation.clearDeviceMetricsOverride');
  await send('Page.navigate',{url:'http://127.0.0.1:5173/workbench.html'});
  socket.close();
}
