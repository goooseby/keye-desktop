import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

function fixture(){
  const images=[];
  class Element {
    constructor(tag){this.tagName=tag.toUpperCase();this.dataset={};this.children=[];this.attributes={};this.classList={add(){},remove(){}};this.connected=true;this.draws=[];this.width=1;this.height=1;}
    get isConnected(){return this.parentElement?.connected||false;}
    append(node){if(node.parentElement)node.parentElement.children=node.parentElement.children.filter(n=>n!==node);node.parentElement=this;this.children.push(node);}
    prepend(node){this.append(node);this.children=[node,...this.children.filter(n=>n!==node)];}
    contains(node){return this.children.includes(node);}
    querySelector(selector){return this.children.find(node=>selector==='canvas.slide'?node.tagName==='CANVAS':selector==='[data-slide-status]'?'slideStatus' in node.dataset:false)||null;}
    setAttribute(name,value){this.attributes[name]=value;}
    removeAttribute(name){delete this.attributes[name];}
    getContext(){return {drawImage:(image,...args)=>this.draws.push({src:image.src,args})};}
  }
  class FakeImage {
    constructor(){images.push(this);}
    set src(value){this.value=value;}
    get src(){return this.value;}
    decode(){return Promise.resolve();}
  }
  const context=vm.createContext({Image:FakeImage,document:{createElement:tag=>new Element(tag)},setTimeout,clearTimeout,console});
  vm.runInContext(fs.readFileSync(new URL('../../public/shared/page-images.js',import.meta.url),'utf8'),context);
  const api=vm.runInContext('KeyePageImages',context);
  const ready=async(src,w=100,h=80)=>{const image=images.findLast(image=>image.src===src);assert.ok(image,'Requested image '+src);image.naturalWidth=w;image.naturalHeight=h;image.onload();await new Promise(resolve=>setTimeout(resolve,0));};
  return {api,images,stage:()=>new Element('div'),ready,tick:()=>new Promise(resolve=>setTimeout(resolve,0))};
}
test('foreground and preload share one decoded image request',async()=>{const f=fixture(),a=f.stage(),b=f.stage();f.api.preload(['a']);f.api.draw(a,{src:'a',page:1});f.api.draw(b,{src:'a',page:1});assert.equal(f.images.length,1);await f.ready('a');assert.equal(a.querySelector('canvas.slide').draws.length,1);assert.equal(b.querySelector('canvas.slide').draws.length,1);});
test('slow and superseded page requests retain the previous frame',async()=>{const f=fixture(),stage=f.stage();f.api.draw(stage,{src:'a',page:1});await f.ready('a');const canvas=stage.querySelector('canvas.slide');f.api.draw(stage,{src:'b',page:2});assert.equal(canvas.draws.at(-1).src,'a');assert.equal(canvas.dataset.page,'1');f.api.draw(stage,{src:'c',page:3});await f.ready('c');await f.ready('b');assert.equal(stage.querySelector('canvas.slide'),canvas);assert.equal(canvas.draws.at(-1).src,'c');assert.equal(canvas.dataset.page,'3');assert.equal(canvas.draws.length,2);});
test('cached flips paint synchronously into the same canvas',async()=>{const f=fixture(),stage=f.stage();await Promise.all(['a','b'].map(src=>{const p=f.api.load(src);return f.ready(src).then(()=>p);}));f.api.draw(stage,{src:'a',page:1});const canvas=stage.querySelector('canvas.slide');f.api.draw(stage,{src:'b',page:2});assert.equal(canvas.dataset.page,'2');assert.equal(stage.querySelector('canvas.slide'),canvas);assert.equal(f.images.length,2);});
test('the first visible bitmap is cropped and unchanged selections do not repaint',async()=>{const f=fixture(),stage=f.stage(),crop=[.25,.25,.5,.5];f.api.draw(stage,{src:'a',page:1,crop});await f.ready('a');const canvas=stage.querySelector('canvas.slide');assert.equal(canvas.width,50);assert.equal(canvas.height,40);assert.deepEqual(canvas.draws[0].args,[25,20,50,40,0,0,50,40]);f.api.draw(stage,{src:'a',page:1,crop});assert.equal(canvas.draws.length,1);f.api.draw(stage,{src:'a',page:1,crop:null});assert.equal(canvas.width,100);assert.equal(canvas.draws.length,2);});
test('a canvas moved to a new grid cannot be painted by its old stage request',async()=>{const f=fixture(),old=f.stage(),next=f.stage();f.api.draw(old,{src:'a',page:1});await f.ready('a');const canvas=old.querySelector('canvas.slide');f.api.draw(old,{src:'b',page:2});next.prepend(canvas);f.api.draw(next,{src:'c',page:3});await f.ready('b');assert.equal(canvas.draws.at(-1).src,'a');await f.ready('c');assert.equal(canvas.draws.at(-1).src,'c');});
test('decoded image cache stays within the original 64 MiB budget',async()=>{const f=fixture(),stage=f.stage();f.api.draw(stage,{src:'large',page:1});await f.ready('large',5000,4000);assert.ok(f.api.stats.bytes<=64*1024*1024);assert.equal(stage.querySelector('canvas.slide').dataset.page,'1');});
