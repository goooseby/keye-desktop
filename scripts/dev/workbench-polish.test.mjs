import fs from 'node:fs';
import assert from 'node:assert/strict';
process.env.KEYE_DEBUG_PORT='9223';
const {evaluate,screenshot}=await import('./cdp.mjs');
const target=(await(await fetch('http://127.0.0.1:9223/json/list')).json()).find(t=>t.url.includes('5173'));
const ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise(resolve=>ws.onopen=resolve);
let sequence=0;const pending=new Map(),errors=[];
ws.onmessage=event=>{const m=JSON.parse(event.data);if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text);if(pending.has(m.id)){pending.get(m.id)(m.result);pending.delete(m.id);}};
const send=(method,params={})=>new Promise(resolve=>{const id=++sequence;pending.set(id,resolve);ws.send(JSON.stringify({id,method,params}));});
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const run=code=>evaluate(`(async()=>{${code}})()`);
const checks=[];
async function check(name,expression){assert.equal(await evaluate(`JSON.stringify(!!(${expression}))`),true,name);checks.push(name);}
async function clip(selector,path){
  const clip=await evaluate(`JSON.stringify((()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,scale:1}})())`);
  const result=await send('Page.captureScreenshot',{format:'png',clip});fs.writeFileSync(path,Buffer.from(result.data,'base64'));
}
try{
  await send('Runtime.enable');await send('Page.reload');await wait(700);
  await send('Emulation.setDeviceMetricsOverride',{width:1100,height:740,deviceScaleFactor:1,mobile:false});
  await check('isolated library',`WorkbenchBusiness.snapshot.settings.libraryDir.includes('workbench-qa-')`);
  await run(`navigate('settings');return JSON.stringify(true)`);await wait(200);
  await check('settings fit one desktop viewport',`document.querySelector('.preferences-sheet').getBoundingClientRect().width<=620&&document.querySelector('.settings-scroll').scrollHeight<=document.querySelector('.settings-scroll').clientHeight+1`);
  await run(`document.querySelector('.download-options').open=true;await new Promise(r=>setTimeout(r,30));const input=document.getElementById('setting-timeout');input.value='45';input.dispatchEvent(new Event('input',{bubbles:true}));render();return JSON.stringify(true)`);
  await check('unsaved advanced parameters survive background renders',`document.getElementById('setting-timeout').value==='45'&&document.querySelector('.download-options').open`);
  await run(`dispatchAction('save-download-settings');const deadline=Date.now()+15000;while(Date.now()<deadline&&(WorkbenchBusiness.snapshot.settings.timeout!==45||Object.keys(ui.downloadDraft).length)){await new Promise(r=>setTimeout(r,50));}return JSON.stringify(true)`);
  await check('advanced settings saved',`WorkbenchBusiness.snapshot.settings.timeout===45&&Object.keys(ui.downloadDraft).length===0`);
  await run(`document.querySelector('.download-options').open=false;return JSON.stringify(true)`);await wait(50);
  await screenshot('.build/workbench-review/polish-settings-1100.png');
  await run(`const f=files.find(file=>!file.deleted);window.qaFileId=f.id;openFile(f.id);selectPage(1);await KeyePageImages.load(f.media[0].src);const crops=new Map(f.crops);crops.set(1,{x:.25,y:.4,w:.5,h:.4});await WorkbenchBusiness.commit(f,f.excluded,crops);await new Promise(r=>setTimeout(r,200));return JSON.stringify(true)`);
  await check('grid shows a cropped bitmap',`document.querySelector('[data-page-tile="1"] canvas').dataset.cropped==='true'&&Math.abs(document.querySelector('[data-page-tile="1"] canvas').width/document.querySelector('[data-page-tile="1"] canvas').height-5/3)<.02`);
  await run(`window.gridBitmap=document.querySelector('[data-page-tile="1"] canvas');for(const page of [1,2,3]){const input=document.querySelector('[data-page-check="'+page+'"]');input.checked=true;input.dispatchEvent(new Event('change',{bubbles:true}));}return JSON.stringify(true)`);
  await check('checkboxes preserve cropped thumbnail nodes',`document.querySelector('[data-page-tile="1"] canvas')===window.gridBitmap&&window.gridBitmap.dataset.cropped==='true'`);
  await clip('[data-page-tile="1"] .review-art','.build/workbench-review/polish-crop-grid.png');
  await clip('.preview-art','.build/workbench-review/polish-crop-side.png');
  await run(`showViewer();await new Promise(r=>setTimeout(r,240));return JSON.stringify(true)`);
  await check('large preview uses the same saved crop',`document.querySelector('.page-surface canvas').dataset.cropped==='true'&&Math.abs(document.querySelector('.page-surface canvas').width/document.querySelector('.page-surface canvas').height-5/3)<.02`);
  await clip('.page-surface','.build/workbench-review/polish-crop-large.png');
  const frames=await run(`
    const file=currentFile();await Promise.all(file.media.map(image=>KeyePageImages.load(image.src)));
    const canvas=document.querySelector('.page-surface canvas'),surface=canvas.parentElement;let removals=0;
    const observer=new MutationObserver(items=>items.forEach(item=>item.removedNodes.forEach(node=>{if(node===canvas)removals++;})));observer.observe(surface,{childList:true});
    const samples=[];for(let i=0;i<60;i++){
      await new Promise(r=>requestAnimationFrame(r));const start=performance.now();const page=i%4+1;selectPage(page);
      samples.push({ms:performance.now()-start,connected:canvas.isConnected,same:surface.querySelector('canvas')===canvas,page:Number(canvas.dataset.page),expected:page,opacity:getComputedStyle(surface).opacity});
    }
    await new Promise(r=>setTimeout(r,0));observer.disconnect();
    return JSON.stringify({samples,removals,cache:KeyePageImages.stats});
  `);
  assert.equal(frames.removals,0);assert.ok(frames.samples.every(frame=>frame.connected&&frame.same&&frame.page===frame.expected&&frame.opacity==='1'));
  checks.push('60 rapid flips keep one canvas, paint the latest page, and never fade');
  await run(`selectPage(1);cropAction();return JSON.stringify(true)`);
  await check('crop editor alone shows original dimensions',`ui.crop&&document.querySelector('.page-surface canvas').dataset.cropped==='false'&&document.querySelector('.page-surface canvas').width===800`);
  await clip('.page-surface','.build/workbench-review/polish-crop-original.png');
  await run(`actions['cancel-crop']();closeViewer();await WorkbenchBusiness.flushPages();return JSON.stringify(true)`);
  await run(`
    const native=(command,data={})=>window.__TAURI_INTERNALS__.invoke('request',{command,data});
    const base=await native('snapshot');window.qaPlatformCalls=[];const listeners={};
    const lessons=[
      {id:'fresh-1',groupId:'alpha',course_id:1,title:'机器学习',day:'2026-11-10',sub_id:1},
      {id:'fresh-2',groupId:'alpha',course_id:1,title:'机器学习',day:'2026-11-12',sub_id:2},
      {id:'known',groupId:'alpha',course_id:1,title:'机器学习',day:'2026-11-11',sub_id:3},
      {id:'queued',groupId:'alpha',course_id:1,title:'机器学习',day:'2026-11-13',sub_id:4},
      {id:'fresh-3',groupId:'beta',course_id:2,title:'机器学习',day:'2026-11-11',sub_id:5},
      {id:'fresh-4',groupId:'beta',course_id:2,title:'机器学习',day:'2026-11-12',sub_id:6},
      {id:'known-two',groupId:'gamma',course_id:3,title:'计算机网络',day:'2026-11-12',sub_id:7}];
    base.materials[0].sourceKey='known';base.materials[1].sourceKey='known-two';
    base.loggedIn=true;base.scanning=false;base.scanned=false;base.loginStatus='隔离测试课表 · 不连接学校平台';base.courses=lessons;
    base.tasks=[{id:'queued-task',sourceKey:'queued',status:'queued',type:'download',title:'排队中的课次',progress:0}];
    window.qaPlatform={base};
    await WorkbenchBusiness.start({listen:async(event,handler)=>{listeners[event]=handler;return()=>{};},call:async(command,data)=>{
      if(command==='snapshot')return structuredClone(base);
      qaPlatformCalls.push({command,data});
      if(command==='scan'){base.scanning=true;base.scanned=false;listeners['snapshot-changed'](structuredClone(base));await new Promise(r=>setTimeout(r,160));base.scanning=false;base.scanned=true;listeners['snapshot-changed'](structuredClone(base));return true;}
      if(command==='download'){for(const id of data.ids)base.tasks.push({id:'get-'+id,sourceKey:id,type:'download',status:'queued',title:id,progress:0});return true;}
      throw Error('Unexpected test platform command '+command);
    }});
    navigate('acquire');await new Promise(r=>setTimeout(r,500));return JSON.stringify(true)
  `);
  await check('same-name courses stay grouped by distinct identities',`document.querySelectorAll('.scan-course').length===3&&document.querySelectorAll('.scan-lesson').length===0`);
  await run(`document.querySelector('[data-scan-group="alpha"]').click();document.querySelector('[data-scan-expand="alpha"]').click();return JSON.stringify(true)`);
  await check('course selection excludes stored and queued lessons',`ui.scanSelected.size===2&&ui.scanSelected.has('fresh-1')&&ui.scanSelected.has('fresh-2')&&!ui.scanSelected.has('known')&&!ui.scanSelected.has('queued')`);
  await check('expansion reveals course lessons and disabled states',`document.querySelectorAll('#scan-lessons-alpha .scan-lesson').length===4&&document.querySelector('[data-scan="known"]').disabled&&document.querySelector('[data-scan="queued"]').disabled`);
  await run(`document.querySelector('[data-scan="fresh-1"]').click();return JSON.stringify(true)`);
  await check('partial course selection is indeterminate',`document.querySelector('[data-scan-group="alpha"]').indeterminate`);
  await run(`document.querySelector('#scan-all').click();return JSON.stringify(true)`);
  await check('global selection includes only eligible lessons',`ui.scanSelected.size===4&&document.querySelector('[data-scan-group="gamma"]').disabled`);
  await screenshot('.build/workbench-review/polish-course-groups-1100.png');
  await run(`const input=document.querySelector('#scan-start');input.value='2026-11-01';input.dispatchEvent(new Event('change',{bubbles:true}));navigate('tasks');await new Promise(r=>setTimeout(r,900));return JSON.stringify(true)`);
  await check('date edits automatically scan while other pages remain usable',`ui.page==='tasks'&&qaPlatformCalls.filter(c=>c.command==='scan').at(-1).data.start==='2026-11-01'&&!WorkbenchBusiness.busy`);
  await run(`navigate('acquire');document.querySelector('#scan-all').click();document.querySelector('#scan-direct-export').click();dispatchAction('download');await new Promise(r=>setTimeout(r,100));return JSON.stringify(true)`);
  await check('per-download export choice is independent of default settings',`qaPlatformCalls.some(c=>c.command==='download'&&c.data.direct===true&&c.data.ids.length===4)&&!qaPlatformCalls.some(c=>c.command==='settings')&&ui.page==='tasks'`);
  await run(`qaPlatform.base.courses.push(...Array.from({length:30},(_,i)=>({id:'long-'+i,groupId:'long-course',course_id:99,title:'长课表边界检查',day:'2026-11-'+String(i%14+1).padStart(2,'0'),sub_id:i+1})));ui.scanExpanded.add('long-course');navigate('acquire');await WorkbenchBusiness.refresh();return JSON.stringify(true)`);
  for(const width of [1100,900,620]){
    await send('Emulation.setDeviceMetricsOverride',{width,height:740,deviceScaleFactor:1,mobile:false});
    for(const position of ['middle','bottom']){
      await run(`const list=document.querySelector('.acquire-content');list.scrollTop=${position==='middle'?'list.scrollHeight/2':'list.scrollHeight'};return JSON.stringify(true)`);await wait(100);
      await check('no content below acquisition footer '+width+' '+position,`(()=>{const bar=document.querySelector('.scan-selection-bar'),scroll=document.querySelector('.acquire-content'),page=document.getElementById('page'),b=bar.getBoundingClientRect();return bar.parentElement===page&&scroll.getBoundingClientRect().bottom<=b.top+1&&Math.abs(b.bottom-page.getBoundingClientRect().bottom)<1})()`);
    }
    if(width===1100)await screenshot('.build/workbench-review/polish-footer-boundary.png');
  }
  await send('Page.reload');await wait(650);
  for(const [width,height] of [[1100,740],[900,600],[620,740]]){
    await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
    for(const page of ['settings','acquire','tasks']){
      await run(`navigate('${page}');return JSON.stringify(true)`);await wait(180);
      await check('layout '+width+' '+page,`ui.page==='${page}'&&document.documentElement.scrollWidth<=innerWidth&&document.querySelector('.workspace').scrollWidth<=document.querySelector('.workspace').clientWidth`);
      if(page==='settings')await screenshot('.build/workbench-review/polish-settings-'+width+'.png');
    }
  }
  assert.deepEqual(errors,[]);
  const times=frames.samples.map(frame=>frame.ms).sort((a,b)=>a-b);
  const report={checks,errors,platform:'isolated lesson fixture; no school/network request',flipMs:{median:times[30],p95:times[57],max:times.at(-1)},cache:frames.cache};
  fs.writeFileSync('.build/workbench-review/polish-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await send('Emulation.clearDeviceMetricsOverride');ws.close();}
