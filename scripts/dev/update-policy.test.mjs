import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

function setup({packaged=true,preferences={},check}={}){
  const state={packaged,appVersion:'0.2.0',tasks:[],updatePreferences:preferences};
  const updateState={info:null,checking:false,downloading:false,ready:false,progress:0,error:'',checkPromise:null,startupScheduled:false,promptedVersion:'',reminderTimer:null};
  const badge={hidden:true},events={},timers=new Map(),calls=[],messages=[],dialogs=[];let now=1900000000000,timerId=0;
  const modal={open:false,dataset:{},classList:{add(){},remove(){}},addEventListener:(event,handler)=>events[event]=handler};
  const context=vm.createContext({state,updateState,modal,view:{page:'library'},
    Date:class extends Date{static now(){return now;}},
    $:selector=>selector==='#app-update-badge'?badge:null,
    document:{hasFocus:()=>true,visibilityState:'visible',addEventListener(){}},window:{addEventListener(){}},
    setTimeout:(fn,delay)=>{timers.set(++timerId,{fn,delay});return timerId;},clearTimeout:id=>timers.delete(id),
    renderUpdateStatus(){},renderSettings(){},toast:message=>messages.push(message),fail:error=>messages.push(String(error)),
    esc:value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;'),
    showModal:(title,body,actions)=>{dialogs.push({title,body,actions});modal.open=true;},
    closeModal:()=>{modal.open=false;events.close?.();},registerActions(){},
    call:async(command,patch)=>{
      calls.push(command);
      if(command==='updatePreferences')return {...state.updatePreferences,...patch};
      if(command==='checkUpdate')return check?check():{available:true,latest:'0.3.0',notes:'- Example update'};
      return true;
    },
  });
  vm.runInContext(readFileSync(new URL('../../public/ui/updates.js',import.meta.url),'utf8'),context);
  return {context,state,updateState,badge,modal,timers,calls,messages,dialogs,events,
    run:code=>vm.runInContext(code,context),advance:ms=>{now+=ms;}};
}

test('ignoring a version suppresses future startup popups but never removes NEW',async()=>{
  const app=setup();await app.run('checkForUpdates()');assert.equal(app.modal.open,true);
  await app.run("dismissUpdate('ignore')");assert.equal(app.modal.open,false);assert.equal(app.badge.hidden,false);
  assert.equal(app.state.updatePreferences.ignoredVersion,'0.3.0');
  app.updateState.promptedVersion='';assert.equal(app.run('canPromptUpdate()'),false);
  app.run('showUpdateDialog()');assert.equal(app.modal.open,true);assert.equal(app.dialogs.length,2);
});
test('a later version is not suppressed by an earlier ignored version',async()=>{
  const app=setup({preferences:{ignoredVersion:'0.2.5'}});await app.run('checkForUpdates()');
  assert.equal(app.modal.open,true);assert.equal(app.badge.hidden,false);
});
test('later reminder persists for 24 hours and keeps NEW available',async()=>{
  const app=setup();await app.run('checkForUpdates()');await app.run("dismissUpdate('later')");
  app.updateState.promptedVersion='';assert.equal(app.run('canPromptUpdate()'),false);assert.equal(app.badge.hidden,false);
  app.advance(24*60*60*1000+100);assert.equal(app.run('canPromptUpdate()'),true);
  app.run('maybePromptUpdate()');assert.equal(app.modal.open,true);
});
test('automatic prompts wait for editor and existing dialogs to finish',async()=>{
  const app=setup();app.context.view.page='editor';await app.run('checkForUpdates()');assert.equal(app.modal.open,false);
  app.context.view.page='library';app.modal.open=true;app.run('maybePromptUpdate()');assert.equal(app.dialogs.length,0);
  app.modal.open=false;app.run('maybePromptUpdate()');assert.equal(app.dialogs.length,1);
});
test('offline startup is silent, while a manual check exposes the error',async()=>{
  const app=setup({check:()=>{throw Error('offline');}});await app.run('checkForUpdates()');
  assert.equal(app.updateState.error,'');assert.equal(app.dialogs.length,0);assert.equal(app.messages.length,0);
  await app.run('checkForUpdates({manual:true})');assert.equal(app.updateState.error,'offline');
});
test('overlapping automatic and manual checks share one request',async()=>{
  let resolve;const app=setup({check:()=>new Promise(done=>{resolve=done;})});
  const first=app.run('checkForUpdates()'),second=app.run('checkForUpdates({manual:true})');
  await Promise.resolve();resolve({available:true,latest:'0.3.0'});await Promise.all([first,second]);
  assert.equal(app.calls.filter(command=>command==='checkUpdate').length,1);
});
test('development builds and the disabled setting never schedule startup checks',()=>{
  const dev=setup({packaged:false});dev.run('scheduleStartupUpdateCheck()');assert.equal(dev.timers.size,0);
  const disabled=setup({preferences:{autoCheck:false}});disabled.run('scheduleStartupUpdateCheck()');assert.equal(disabled.timers.size,0);
});
test('NEW opens the changelog directly and safely escapes release HTML',()=>{
  const app=setup({preferences:{autoCheck:false,ignoredVersion:'0.3.0'}});
  app.updateState.info={available:true,latest:'0.3.0',notes:'<script>unsafe()</script>'};app.run('showUpdateDialog()');
  assert.match(app.dialogs[0].body,/&lt;script&gt;/);assert.doesNotMatch(app.dialogs[0].body,/<script>/);
  assert.match(app.dialogs[0].actions,/download-update/);assert.match(app.dialogs[0].actions,/install-update/);
});
test('installation is blocked while course work is active',async()=>{
  const app=setup();app.updateState.ready=true;app.state.tasks=[{status:'running'}];await app.run('installUpdate()');
  assert.equal(app.calls.includes('installUpdate'),false);assert.equal(app.messages.length,1);
  app.state.tasks=[];await app.run('installUpdate()');assert.equal(app.calls.includes('installUpdate'),true);
});
