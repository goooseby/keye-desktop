import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

function fixture(){
  const source={materials:[{id:'a',courseId:null,title:'真实课件',day:'2026-11-01',pages:3,excluded:[],crops:{},revision:0,reviewRevision:null,exportRevision:null,lastPage:1,media:[],edited:false}],courseLibrary:[],tasks:[],settings:{libraryDir:'test-only',maxWorkers:2},updatePreferences:{autoCheck:true}};
  const listeners={},calls=[],notices=[];
  let rejectSave=false,release=null;
  const context=vm.createContext({console,setTimeout,clearTimeout,document:{documentElement:{dataset:{business:'live'}},querySelectorAll:()=>[],querySelector:()=>null},window:{},
    files:[],courses:[],ui:{page:'library',recent:[],selected:new Set(),scanSelected:new Set(),scope:'all'},reviewUi:{selected:new Set(),scrolls:new Map()},libraryScroll:new Map(),
    WorkspaceTabs:{reset(){},reconcile(){}},render(){},renderTasks(){},closeViewer(){},notify:message=>notices.push(message),root:{},icon:()=>'',escapeHtml:String});
  const run=code=>vm.runInContext(code,context);
  context.openFile=(id)=>{run(`ui.page='editor';ui.openFile=${JSON.stringify(id)}`);};
  context.currentFile=()=>run('files.find(file=>file.id===ui.openFile)');
  context.navigate=(page,scope)=>run(`ui.page=${JSON.stringify(page)};ui.scope=${JSON.stringify(scope||'all')}`);
  for(const file of ['business-model.js','business.js'])run(fs.readFileSync(new URL('../../public/workbench/'+file,import.meta.url),'utf8'));
  const service={listen:async(event,handler)=>{listeners[event]=handler;return()=>{};},call:async(command,data)=>{
    calls.push({command,data});
    if(command==='snapshot')return structuredClone(source);
    if(command==='reviewed'){if(rejectSave)throw Error('保存被拒绝');source.materials.find(m=>m.id===data.id).reviewRevision=data.revision;return true;}
    if(command==='pageState'){
      if(release)await new Promise(resolve=>{release=resolve;});
      if(rejectSave)throw Error('保存被拒绝');
      const m=source.materials.find(m=>m.id===data.id);if(m.revision!==data.revision)throw Error('版本冲突');
      m.excluded=data.excluded;m.crops=data.crops;m.revision++;m.edited=true;return true;
    }
    return true;
  }};
  return {source,context,run,calls,notices,listeners,start:()=>run('WorkbenchBusiness').start(service),reject:()=>{rejectSave=true;},delay:()=>{release=true;},release:()=>release(),json:code=>JSON.parse(run(`JSON.stringify(${code})`))};
}
test('null review/export revisions are pending and unexported',async()=>{const f=fixture();await f.start();assert.equal(f.run('files[0].review'),'pending');assert.equal(f.run('files[0].exported'),false);assert.equal(f.run('courses[0].id'),'unfiled');});
test('stale export is not displayed as current',async()=>{const f=fixture();f.source.materials[0].exported=true;f.source.materials[0].exportRevision=0;f.source.materials[0].revision=1;await f.start();assert.equal(f.run('files[0].exported'),false);});
test('import names remain intact and downloaded tabs include lecture date',async()=>{const f=fixture();f.source.materials[0].source='import';f.source.materials[0].topic='课堂课件';await f.start();assert.equal(f.run('files[0].title'),'真实课件');f.source.materials[0].source='download';await f.run('WorkbenchBusiness.refresh()');assert.equal(f.run('files[0].title'),'2026-11-01 · 真实课件');});
test('page-state translation preserves normalized crop order and precision',async()=>{const f=fixture();await f.start();const value=f.json('WorkbenchModel.pageState(files[0],new Set([3,1]),new Map([[2,{x:.123456789,y:.2,w:.5,h:.6}]]))');assert.deepEqual(value,{id:'a',revision:0,excluded:[1,3],crops:{2:[.123457,.2,.5,.6]}});});
test('successful save reads back revision and adds exactly one undo state',async()=>{const f=fixture();await f.start();await f.run('WorkbenchBusiness.commit(files[0],new Set([2]),new Map())');assert.equal(f.run('files[0].revision'),1);assert.deepEqual(f.json('[...files[0].excluded]'),[2]);assert.equal(f.run('files[0].history.length'),1);});
test('save failure leaves model selection and history unchanged',async()=>{const f=fixture();await f.start();f.run('reviewUi.selected.add(2);files[0].history.push({excluded:new Set(),crops:new Map()})');f.reject();assert.equal(await f.run('WorkbenchBusiness.commit(files[0],new Set([2]),new Map())'),false);assert.deepEqual(f.json('[...files[0].excluded]'),[]);assert.equal(f.run('reviewUi.selected.has(2)'),true);assert.equal(f.run('files[0].history.length'),1);assert.ok(f.notices.includes('保存被拒绝'));});
test('pending save blocks repeat writes and navigation',async()=>{const f=fixture();await f.start();f.delay();const saving=f.run('WorkbenchBusiness.commit(files[0],new Set([2]),new Map())');await new Promise(resolve=>setTimeout(resolve,0));assert.equal(f.run('WorkbenchBusiness.canLeave()'),false);assert.equal(await f.run('WorkbenchBusiness.commit(files[0],new Set([3]),new Map())'),false);f.release();await saving;assert.equal(f.calls.filter(c=>c.command==='pageState').length,1);assert.equal(f.run('WorkbenchBusiness.busy'),false);});
test('undo uses latest revision and removes history only after persistence',async()=>{const f=fixture();await f.start();await f.run('WorkbenchBusiness.commit(files[0],new Set([2]),new Map())');await f.run('WorkbenchBusiness.commit(files[0],files[0].history[0].excluded,files[0].history[0].crops,{undo:true})');assert.equal(f.run('files[0].revision'),2);assert.equal(f.run('files[0].history.length'),0);assert.deepEqual(f.json('[...files[0].excluded]'),[]);});
test('external material change clears stale undo history',async()=>{const f=fixture();await f.start();f.run('files[0].history.push({})');f.source.materials[0].revision=4;f.listeners['snapshot-changed'](structuredClone(f.source));assert.equal(f.run('files[0].history.length'),0);});
test('task events update real jobs without creating demo records',async()=>{const f=fixture();await f.start();f.listeners['task-changed']({id:'real-task',status:'failed',error:'测试失败',materialId:'a'});assert.equal(f.run('ui.tasks.length'),1);assert.equal(f.run('ui.tasks[0].description'),'测试失败');assert.equal(f.run('ui.tasks[0].fileId'),'a');});
test('background snapshot does not replace a crop draft',async()=>{const f=fixture();await f.start();f.run('ui.crop={x:.1,y:.1,w:.8,h:.8}');f.listeners['snapshot-changed'](structuredClone(f.source));assert.equal(f.run('ui.crop.w'),.8);});
test('course grouping uses identity and counts only selectable lessons',async()=>{const f=fixture();const result=f.json(`WorkbenchModel.scanGroups([{id:'a',groupId:'one',name:'同名课程',date:'2026-11-02'},{id:'b',groupId:'one',name:'同名课程',date:'2026-11-01'},{id:'c',groupId:'two',name:'同名课程',date:'2026-11-01'}],new Set(['a']),id=>id==='b',id=>id==='b')`);assert.equal(result.length,2);assert.equal(result[0].items[0].id,'b');assert.equal(result[0].eligible.length,1);assert.equal(result[0].checked,true);assert.equal(result[0].stored,1);});
test('partially selected courses expose an indeterminate group state',async()=>{const f=fixture();const result=f.json(`WorkbenchModel.scanGroups([{id:'a',course_id:1,name:'课程',date:'2026-11-01'},{id:'b',course_id:1,name:'课程',date:'2026-11-02'}],new Set(['a']),()=>false,()=>false)`);assert.equal(result[0].partial,true);assert.equal(result[0].checked,false);});
test('explicit review queue advances chronologically and returns to its scope',async()=>{const f=fixture();f.source.materials.push({...structuredClone(f.source.materials[0]),id:'b',day:'2026-11-02'});await f.start();f.run(`ui.scope='course-one';WorkbenchBusiness.startReview([...files].reverse())`);assert.equal(f.run('ui.openFile'),'a');await f.run('WorkbenchBusiness.completeReview()');assert.equal(f.run('ui.openFile'),'b');await f.run('WorkbenchBusiness.completeReview()');assert.equal(f.run('ui.page'),'library');assert.equal(f.run('ui.scope'),'course-one');});
test('failed completion preserves review queue and current document',async()=>{const f=fixture();await f.start();f.run('WorkbenchBusiness.startReview(files)');f.reject();await f.run('WorkbenchBusiness.completeReview()');assert.equal(f.run('ui.openFile'),'a');assert.equal(f.run('WorkbenchBusiness.reviewContext(files[0]).active'),true);});
test('ordinary review completion does not invent a queue',async()=>{const f=fixture();await f.start();f.run(`ui.page='editor';ui.openFile='a'`);await f.run('WorkbenchBusiness.completeReview()');assert.equal(f.run('ui.page'),'editor');assert.equal(f.run('WorkbenchBusiness.reviewContext(files[0]).active'),false);});
