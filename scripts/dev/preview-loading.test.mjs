import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

function setup(){
  const images=[],timers=new Map();let timerId=0;
  class Image {
    constructor(){images.push(this);this.naturalWidth=0;this.naturalHeight=0;}
    set src(src){this.url=src;}get src(){return this.url;}
    load(width=1200,height=800){this.naturalWidth=width;this.naturalHeight=height;this.onload?.();}
    error(){this.onerror?.();}
  }
  const make=()=>({dataset:{},isConnected:true,hidden:false,style:{},attrs:{},
    setAttribute(k,v){this.attrs[k]=v},removeAttribute(k){delete this.attrs[k]},
    classList:{remove(){}},getBoundingClientRect:()=>({width:600,height:400}),
  });
  const draws=[],canvas=make();canvas.getContext=()=>({drawImage:(...args)=>draws.push(args)});
  const stage=make(),children=[];
  stage.querySelector=s=>s==='canvas.slide'?children.find(c=>c===canvas):s==='img.slide'?null:children.find(c=>'slideStatus'in c.dataset);
  stage.querySelectorAll=()=>[];stage.prepend=e=>children.unshift(e);stage.append=e=>children.push(e);
  const context=vm.createContext({Image,document:{createElement:tag=>tag==='canvas'?canvas:make()},
    cropOf:(m,p)=>m.crops?.[p]||null,missingPage:()=>null,esc:s=>s,
    setTimeout:fn=>{timers.set(++timerId,fn);return timerId},clearTimeout:id=>timers.delete(id),
  });
  vm.runInContext(readFileSync(new URL('../../public/ui/media.js',import.meta.url),'utf8'),context);
  const m={title:'Test',media:Array.from({length:40},(_,i)=>({src:`http://test/${i+1}.jpg`}))};
  const show=(page,raw=false)=>{context.stage=stage;context.m=m;context.page=page;context.raw=raw;vm.runInContext('updateSlideSource(stage,m,page,raw)',context)};
  return{context,stage,canvas,children,draws,images,timers,m,show};
}
const flush=async()=>{await Promise.resolve();await Promise.resolve();await Promise.resolve();};

test('navigation paints pixels without waiting for an offscreen decode promise',async()=>{
  const s=setup();s.show(28);s.images[0].load();await flush();
  assert.equal(s.canvas.dataset.page,'28');assert.equal(s.draws.length,1);assert.equal(s.stage.attrs['aria-busy'],undefined);
});
test('previous pixels remain visible while the next page loads',async()=>{
  const s=setup();s.show(28);s.images[0].load();await flush();s.show(29);
  assert.equal(s.canvas.dataset.page,'28');assert.equal(s.canvas.width,1200);assert.equal(s.draws.length,1);
  s.images[1].load();await flush();assert.equal(s.canvas.dataset.page,'29');
});
test('obsolete completions cannot draw over the latest requested page',async()=>{
  const s=setup();s.show(28);s.show(29);s.show(30);
  s.images[2].load();await flush();s.images[0].load();s.images[1].load();await flush();
  assert.equal(s.canvas.dataset.page,'30');assert.equal(s.draws.length,1);
});
test('cached backward navigation draws synchronously and makes no new request',async()=>{
  const s=setup();s.show(28);s.images[0].load();await flush();s.show(29);s.images[1].load();await flush();
  s.show(28);assert.equal(s.canvas.dataset.page,'28');assert.equal(s.images.length,2);
});
test('snapshot redraws reuse a pending request',async()=>{
  const s=setup();s.show(28);s.show(28);s.show(28);assert.equal(s.images.length,1);
  s.images[0].load();await flush();assert.equal(s.draws.length,1);
});
test('crop is drawn directly into the pixel surface and raw mode restores the full image',async()=>{
  const s=setup();s.m.crops={28:[0.1,0.2,0.5,0.5]};s.show(28);s.images[0].load();await flush();
  assert.equal(s.canvas.width,600);assert.equal(s.canvas.height,400);assert.deepEqual(s.draws[0].slice(1,5),[120,160,600,400]);
  s.show(28,true);assert.equal(s.canvas.width,1200);assert.equal(s.canvas.height,800);
});
test('stalled reads retry and then expose a working retry control',async()=>{
  const s=setup();s.show(28);[...s.timers.values()][0]();assert.equal(s.images.length,2);
  [...s.timers.values()][0]();await flush();
  const status=s.children.find(c=>'slideStatus'in c.dataset);assert.equal(status.disabled,false);assert.match(status.textContent,/重试/);
  status.onclick();assert.equal(s.images.length,3);s.images[2].load();await flush();assert.equal(s.canvas.dataset.page,'28');assert.equal(status.hidden,true);
});
test('closing the preview prevents a late completion from touching detached surfaces',async()=>{
  const s=setup();s.show(28);s.canvas.isConnected=false;s.images[0].load();await flush();assert.equal(s.draws.length,0);
});
test('decoded cache evicts old pages when its memory budget is exceeded',async()=>{
  const s=setup();for(let p=1;p<=4;p++){s.show(p);s.images.at(-1).load(3000,2000);await flush();}
  const size=vm.runInContext('slideCache.size',s.context);assert.ok(size<=2);
  s.show(1);assert.equal(s.images.length,5);
});

test('a delayed close event cannot dismantle a preview that has already reopened',()=>{
  let close,rendered=0,removed=0;
  const view={page:'editor',crop:{page:23}},modal={open:true,classList:{remove:()=>removed++},addEventListener:(name,fn)=>{if(name==='close')close=fn}};
  const context=vm.createContext({view,modal,cropGesture:null,document:{addEventListener(){}},registerDataHandlers(){},registerActions(){},registerDataChanges(){}});
  vm.runInContext(readFileSync(new URL('../../public/ui/pages/editor.js',import.meta.url),'utf8'),context);
  context.renderEditor=()=>rendered++;
  close();assert.equal(removed,0);assert.equal(rendered,0);assert.equal(view.crop.page,23);
  modal.open=false;close();assert.equal(removed,1);assert.equal(rendered,1);assert.equal(view.crop,null);
});
