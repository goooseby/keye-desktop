// Exercise actual native close events using only the isolated QA window on 9223.
import assert from 'node:assert/strict';
import fs from 'node:fs';
process.env.KEYE_DEBUG_PORT='9223';
const {evaluate}=await import('./cdp.mjs');
const target=(await(await fetch('http://127.0.0.1:9223/json/list')).json()).find(t=>t.url.includes('5173'));
const socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise(resolve=>socket.onopen=resolve);
let sequence=0;const pending=new Map(),errors=[],checks=[];
socket.onmessage=event=>{const m=JSON.parse(event.data);if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.value||m.params.exceptionDetails.text);if(pending.has(m.id)){pending.get(m.id)(m.result);pending.delete(m.id);}};
const send=(method,params={})=>new Promise(resolve=>{const id=++sequence;pending.set(id,resolve);socket.send(JSON.stringify({id,method,params}));});
const run=body=>evaluate('JSON.stringify((()=>{'+body+'})())');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
try {
  await send('Runtime.enable');
  let ready=false;
  for(let i=0;i<100;i++){if(await run('return typeof WorkbenchBusiness!=="undefined"&&!!WorkbenchBusiness.snapshot;')){ready=true;break;}await pause(100);}
  assert.equal(ready,true,'The isolated workbench finishes starting before native close checks');
  assert.ok(await run('return WorkbenchBusiness.snapshot.settings.libraryDir.includes("workbench-qa-");'));
  await run('window.originalCloseCheck=window.prepareWorkbenchClose;window.closeChecks=0;window.prepareWorkbenchClose=async()=>{closeChecks++;return false;};document.querySelector("[data-action=window-close]").click();return true;');await pause(250);
  assert.equal(await run('return closeChecks;'),1);checks.push('native close preserves the window when saving blocks it');
  await run('window.prepareWorkbenchClose=()=>{closeChecks++;return new Promise(resolve=>{window.resolveCloseCheck=resolve;});};document.querySelector("[data-action=window-close]").click();document.querySelector("[data-action=window-close]").click();return true;');await pause(250);
  assert.equal(await run('return closeChecks;'),2);checks.push('repeated close requests share one pending save check');
  await run('resolveCloseCheck(false);return true;');await pause(150);
  assert.equal(await run('return !!document.querySelector("[data-action=window-close]");'),true);checks.push('declining an asynchronous close leaves the window usable');
  await run('window.prepareWorkbenchClose=async()=>{throw Error("isolated close-check failure");};document.querySelector("[data-action=window-close]").click();return true;');await pause(150);
  assert.equal(await run('return !!document.querySelector("[data-action=window-close]");'),true);checks.push('save-check failures keep the window open and allow a later retry');
  await run('window.prepareWorkbenchClose=window.originalCloseCheck;document.querySelector("[data-action=window-close]").click();return true;');
  let gone=false;
  for(let i=0;i<80;i++){
    await pause(100);
    try {const targets=await(await fetch('http://127.0.0.1:9223/json/list',{signal:AbortSignal.timeout(500)})).json();if(!targets.some(t=>t.id===target.id)){gone=true;break;}}
    catch {gone=true;break;}
  }
  assert.equal(gone,true,'The actual native window exits after the save check');
  assert.deepEqual(errors,[],'Closing must not fail with missing destroy permissions');
  checks.push('actual titlebar close destroys the native window without permission errors');
  fs.writeFileSync('.build/workbench-review/close-report.json',JSON.stringify({checks,errors},null,2));console.log(JSON.stringify({checks,errors},null,2));
} finally {socket.close();}
