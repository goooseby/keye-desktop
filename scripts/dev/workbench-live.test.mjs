// Requires the isolated fixture app on 9223; never writes to installed/dev data.
import fs from 'node:fs';
import assert from 'node:assert/strict';
process.env.KEYE_DEBUG_PORT='9223';
const {evaluate,screenshot}=await import('./cdp.mjs');
const fixture=JSON.parse(fs.readFileSync('.build/workbench-review/qa-process.json','utf8'));
assert.ok(fixture.root.replaceAll('\\','/').includes('/.build/workbench-qa-'));
const target=(await(await fetch('http://127.0.0.1:9223/json/list')).json()).find(t=>t.type==='page');
const ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise(resolve=>ws.onopen=resolve);
let sequence=0;const jobs=new Map(),errors=[];
ws.onmessage=event=>{const m=JSON.parse(event.data);if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text);if(jobs.has(m.id)){jobs.get(m.id)(m);jobs.delete(m.id);}};
const send=(method,params={})=>new Promise(resolve=>{const id=++sequence;jobs.set(id,resolve);ws.send(JSON.stringify({id,method,params}));});
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
try{
  await send('Runtime.enable');await send('Page.navigate',{url:'http://127.0.0.1:5173/workbench.html'});await wait(800);
  const report=await evaluate(`(async()=>{
    const checks=[],check=(name,ok)=>{if(!ok)throw Error(name);checks.push(name);};
    const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
    const raw=()=>window.__TAURI_INTERNALS__.invoke('request',{command:'snapshot',data:{}});
    const before=await raw();
    check('isolated fixture only',before.settings.libraryDir===${JSON.stringify(fixture.root)}&&before.materials.length===2);
    check('approved UI loaded without legacy DOM',!!document.querySelector('.navigation')&&!document.querySelector('#main')&&WorkbenchBusiness.enabled);
    const [first,second]=files.filter(f=>!f.deleted),id=first.id;
    openFile(id);await WorkbenchBusiness.commit(first,new Set(),new Map());first.history=[];const initialRevision=first.revision;
    selectPage(3);reviewUi.selected.add(1);openFile(second.id);selectPage(2);reviewUi.selected.add(2);openFile(id);
    check('independent real document sessions',ui.current===3&&reviewUi.selected.has(1)&&!reviewUi.selected.has(2)&&WorkspaceTabs.count===3);
    await mutatePages([2],true);
    let stored=(await raw()).materials.find(m=>m.id===id);
    check('exclusion persisted with revision',stored.excluded.includes(2)&&stored.revision===initialRevision+1&&currentFile().revision===initialRevision+1);
    selectPage(1);showViewer();cropAction();ui.crop={x:.1,y:.1,w:.8,h:.8};await applyCropToPages([1],true);
    stored=(await raw()).materials.find(m=>m.id===id);
    check('crop persisted in normalized coordinates',JSON.stringify(stored.crops['1'])==='[0.1,0.1,0.8,0.8]');
    await undo();stored=(await raw()).materials.find(m=>m.id===id);
    check('undo crop retains earlier exclusions',!stored.crops['1']&&stored.excluded.includes(2));
    await undo();stored=(await raw()).materials.find(m=>m.id===id);
    check('undo exclusion persists',stored.excluded.length===0);
    closeViewer();selectPage(1);showViewer();cropAction();ui.crop={x:.1,y:.1,w:.8,h:.8};await applyCropToPages([1,2,3,4],true);await mutatePages([4],true);closeViewer();
    showExport([id]);document.querySelector('#export-name').value='integration-output-'+Date.now()+'.pdf';dispatchAction('confirm-export');
    const exportDeadline=Date.now()+15000;
    while(Date.now()<exportDeadline){await pause(100);const current=(await raw()).materials.find(m=>m.id===id);if(current.exportRevision===current.revision&&current.exportPath?.includes('integration-output'))break;}
    stored=(await raw()).materials.find(m=>m.id===id);
    check('real PDF export completed',stored.exported&&stored.exportRevision===stored.revision&&stored.exportPath.includes('integration-output')&&!stored.exportPath.endsWith('.pdf.pdf'));
    dispatchAction('complete');await pause(400);stored=(await raw()).materials.find(m=>m.id===id);
    check('review completion persisted for exact revision',stored.reviewRevision===stored.revision);
    selectPage(3);await WorkbenchBusiness.flushPages();
    check('last page persisted per material',(await raw()).materials.find(m=>m.id===id).lastPage===3);
    navigate('tasks');check('only backend tasks are rendered',ui.tasks.length===(await raw()).tasks.length&&ui.tasks.some(t=>t.type==='export'));
    navigate('settings');await WorkbenchBusiness.saveSetting({maxWorkers:3});check('settings persisted',(await raw()).settings.maxWorkers===3);
    openFile(id);ui.menuFile=id;dispatchAction('trash-file');await pause(400);
    check('trashing closes corresponding real tab',!document.querySelector('.document-tabs [data-tab="file:'+id+'"]')&&files.find(f=>f.id===id).deleted);
    ui.menuFile=id;dispatchAction('restore-file');await pause(400);openFile(id);
    check('restore retains actual page edits',currentFile().crops.size===4&&currentFile().excluded.has(4));
    await pause(300);
    const bitmap=document.querySelector('[data-page-tile="1"] canvas');
    check('real cropped bitmap has original aspect ratio',bitmap.dataset.cropped==='true'&&Math.abs(bitmap.width/bitmap.height-4/3)<.01);
    return JSON.stringify({checks,id,output:stored.exportPath});
  })()`);
  await send('Page.reload');await wait(600);
  assert.equal(await evaluate(`JSON.stringify(files.find(f=>f.id===${JSON.stringify(report.id)}).crops.size===4)`),true,'Reload reads persisted crops');
  const sizes=[];
  for(const [width,height] of [[1440,900],[1100,740],[900,600],[620,740]]){
    await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
    for(const page of ['library','editor','acquire','tasks','settings']){
      await evaluate(`JSON.stringify((${page==='editor'?`openFile(${JSON.stringify(report.id)})`:`navigate('${page}')`},true))`);await wait(240);
      assert.equal(await evaluate('JSON.stringify(ui.page)'),page,'Correct page rendered');
      assert.equal(await evaluate(`JSON.stringify(document.documentElement.scrollWidth<=innerWidth&&document.querySelector('.workspace').scrollWidth<=document.querySelector('.workspace').clientWidth)`),true,'No overflow '+width+' '+page);
      if(width===1100||width===620)await screenshot('.build/workbench-review/live-'+page+'-'+width+'.png');
    }
    sizes.push(width);
  }
  assert.deepEqual(errors,[]);
  fs.writeFileSync('.build/workbench-review/live-report.json',JSON.stringify({...report,sizes,errors},null,2));
  console.log(JSON.stringify({...report,sizes,errors},null,2));
}finally{await send('Emulation.clearDeviceMetricsOverride');ws.close();}
