import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

// Run the actual classic UI scripts with an isolated snapshot and command bridge.
// No installed or development library is read or changed.
function fixture(){
  const elements=new Map();
  const element=()=>({parentElement:{hidden:false},innerHTML:'',textContent:'',hidden:false,open:false,dataset:{},style:{},classList:{add(){},remove(){},toggle(){},contains(){return false}},addEventListener(){},querySelector(){return element()},querySelectorAll(){return []},append(){},showModal(){this.open=true},close(){this.open=false}});
  const document={querySelector(s){if(!elements.has(s))elements.set(s,element());return elements.get(s)},querySelectorAll(){return []},addEventListener(){},body:element(),createElement:element};
  const calls=[];
  const context=vm.createContext({document,window:{addEventListener(){}},location:{hash:'#editor/m1'},console,setTimeout(){return 0},clearTimeout(){},requestAnimationFrame(){},URL});
  const run=source=>vm.runInContext(source,context);
  const html=fs.readFileSync(new URL('../../index.html',import.meta.url),'utf8');
  for(const [,path] of html.matchAll(/<script src="\/([^\"]+)"/g)){
    vm.runInContext(fs.readFileSync(new URL('../../public/'+path,import.meta.url),'utf8'),context,{filename:path});
  }
  run(`
    state={materials:['m1','m2','m3'].map((id,i)=>({id,courseId:'c1',title:'课程',topic:'课件'+i,day:'2026-10-31',pages:0,excluded:[],revision:1,reviewRevision:0})),courseLibrary:[{id:'c1',title:'课程',term:''}],tasks:[],settings:{exportMode:'review'},reviewQueue:['m1','m2']};
    ready=true;view.materialId='m1';view.page='editor';
  `);
  context.window.keyeInvoke=async(command,data)=>{
    calls.push({command,...data});
    if(command==='reviewed')run(`state.materials.find(m=>m.id===${JSON.stringify(data.id)}).reviewRevision=${data.revision}`);
    return true;
  };
  return {run,calls,context,markup:()=>elements.get('#main').innerHTML};
}

test('ordinary completion stays in place and ignores an old persisted queue',async()=>{
  const f=fixture();f.run('renderEditor()');
  assert.match(f.markup(),/完成整理/);
  assert.doesNotMatch(f.markup(),/review-completion|editor-summary|完成并继续/);
  assert.ok(f.markup().indexOf('complete-review')<f.markup().indexOf('editor-layout'));
  await f.run('completeReview()');
  assert.equal(f.context.location.hash,'#editor/m1');
  assert.match(f.markup(),/data-action="complete-review" disabled/);
  await f.run('completeReview()');
  assert.equal(f.calls.filter(c=>c.command==='reviewed').length,1);
  f.run('state.materials[0].revision++;renderEditor()');
  assert.match(f.markup(),/完成整理/);
  assert.doesNotMatch(f.markup(),/data-action="complete-review" disabled/);
});

test('explicit batch advances in its chosen order and returns after the last item',async()=>{
  const f=fixture();await f.run("startReview([state.materials[0],state.materials[2]])");
  f.run('route()');assert.match(f.markup(),/完成并继续/);
  await f.run('completeReview()');assert.equal(f.context.location.hash,'editor/m3');
  f.run('route()');assert.match(f.markup(),/完成并返回/);
  await f.run('completeReview()');assert.equal(f.context.location.hash,'course/c1');
  assert.equal(f.run('view.reviewIds.length'),0);
  assert.deepEqual(f.calls.filter(c=>c.command==='reviewed').map(c=>c.id),['m1','m3']);
});

test('single course entry stays ordinary; leaving a batch or opening normally ends it',async()=>{
  const f=fixture();
  await f.run("courseClick({dataset:{courseSession:'m1'}})");
  assert.equal(f.run('view.reviewIds.length'),0);
  await f.run('startReview(state.materials)');
  f.run("navigate('library');route()");
  assert.equal(f.run('view.reviewIds.length'),0);
  await f.run('startReview(state.materials)');
  f.run("openMaterial('m2');route()");assert.equal(f.run('view.reviewIds.length'),0);
  assert.match(f.markup(),/完成整理/);
});

test('failed save retains the current batch and can be retried',async()=>{
  const f=fixture();await f.run('startReview(state.materials)');f.run('route()');
  const invoke=f.context.window.keyeInvoke;
  f.context.window.keyeInvoke=async()=>{throw new Error('save failed')};
  await assert.rejects(f.run('completeReview()'),/save failed/);
  assert.equal(f.context.location.hash,'#editor/m1');
  assert.equal(f.run('view.saving'),false);
  assert.equal(f.run('view.reviewIds.length'),3);
  f.context.window.keyeInvoke=invoke;
  await f.run('completeReview()');assert.equal(f.context.location.hash,'editor/m2');
});

test('saving blocks duplicate completion and navigation',async()=>{
  const f=fixture();let release;
  f.context.window.keyeInvoke=()=>new Promise(resolve=>{release=resolve});
  const saving=f.run('completeReview()');
  assert.equal(f.run('view.saving'),true);
  await f.run('completeReview()');f.run("openMaterial('m2')");
  assert.equal(f.context.location.hash,'#editor/m1');
  release(true);await saving;assert.equal(f.run('view.saving'),false);
});

test('already reviewed batch items can advance; deleted next items are skipped',async()=>{
  const f=fixture();await f.run('startReview(state.materials)');f.run('route();state.materials[0].reviewRevision=1;state.materials[1].deleted=true;renderEditor()');
  assert.match(f.markup(),/完成并继续/);
  await f.run('completeReview()');assert.equal(f.context.location.hash,'editor/m3');
  assert.equal(f.calls.filter(c=>c.command==='reviewed').length,0);
});
