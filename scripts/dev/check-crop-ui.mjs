// 裁剪模式与勾选：模式内不出翻页、控件一次到位、方向键微调、勾选不被清空。
// 前置：用 scripts/inspect.ps1 启动开发版（带 WebView2 调试端口），再执行 node scripts/dev/check-crop-ui.mjs

import { evaluate } from './cdp.mjs';

const list = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const target = list.find(t => t.type === 'page' && (t.url || '').includes('5173'));
if (!target) { console.error('未找到应用页面'); process.exit(1); }

const expression = `(async()=>{
  const out={};
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const raf=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
  const box=s=>document.querySelector(s);
  const waitFor=async(check,timeout=6000)=>{const end=Date.now()+timeout;while(Date.now()<end){try{if(check())return true;}catch{}await wait(100);}return false;};
  const idle=async()=>{for(let i=0;i<60&&view.saving;i++)await wait(100);};
  const cropsNow=()=>JSON.parse(JSON.stringify(material().crops||{}));
  const cluster=()=>[...document.querySelectorAll('#fullscreen-crop-tools button')].map(b=>b.textContent.trim());
  const disabled=()=>[...document.querySelectorAll('#fullscreen-crop-tools button')].map(b=>b.disabled);

  if(modal.open)modal.close();
  const pick=state.materials.filter(m=>!m.deleted&&m.kind!=='pdf'&&m.pages>=8).sort((a,b)=>b.pages-a.pages)[0];
  const backup=JSON.parse(JSON.stringify(pick.crops||{}));
  out.material={id:pick.id,pages:pick.pages,cropsAtStart:Object.keys(backup).length};
  view.materialId=pick.id;view.page='editor';view.pageFilter='all';view.currentPage=1;view.selected.clear();view.undo=[];view.crop=null;render();
  await waitFor(()=>box('.page-art img.slide')?.naturalWidth);
  await call('pageState',{id:pick.id,excluded:[...material().excluded],crops:{},revision:material().revision});
  await waitFor(()=>Object.keys(cropsNow()).length===0);
  renderEditor();await wait(300);

  for(const page of [2,3,4]){const input=box('[data-page-check="'+page+'"]');input.checked=true;input.dispatchEvent(new Event('change',{bubbles:true}));}
  out.gridSelect={selected:[...view.selected]};

  // 1) 浏览态：没有裁剪时只有「裁剪」，翻页与排除都在，一行高度
  box('[data-page-tile="1"] .page-art').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}));
  await raf();await wait(350);
  out.browseNoCrop={cluster:cluster(),disabled:disabled(),pager:!!box('.nav-pager'),exclude:!!box('.nav-exclude'),navHeight:Math.round(box('.full-nav').getBoundingClientRect().height),stageHeight:Math.round(box('#fullscreen-stage').getBoundingClientRect().height),selected:[...view.selected]};

  // 2) 进入裁剪模式：翻页/排除消失，裁剪控件一次到位（未可用的置灰但位置固定）
  box('[data-action="crop-toggle"]').click();
  await raf();await wait(350);
  out.cropMode={cluster:cluster(),disabled:disabled(),pager:!!box('.nav-pager'),exclude:!!box('.nav-exclude'),navHeight:Math.round(box('.full-nav').getBoundingClientRect().height),readout:box('#crop-readout')?.textContent,selected:[...view.selected]};

  // 3) 裁剪模式下方向键是微调（不是翻页）；先把框缩小，留出移动空间
  view.crop={page:1,x:0.1,y:0.1,w:0.5,h:0.5};paintCropBox();updateCropReadout();
  const before=JSON.stringify(view.crop);
  const key=(k,shift)=>document.body.dispatchEvent(new KeyboardEvent('keydown',{key:k,shiftKey:!!shift,bubbles:true,cancelable:true}));
  key('ArrowRight');
  await wait(120);
  const nudged=JSON.stringify(view.crop);
  key('ArrowDown',true);
  await wait(120);
  out.arrowInCropMode={page:view.currentPage,movedRight:nudged!==before,movedDown:JSON.stringify(view.crop)!==nudged,before:JSON.parse(before),after:view.crop&&[view.crop.x,view.crop.y,view.crop.w,view.crop.h]};
  await idle();await wait(600);

  // 4) 拖动一个手柄
  const layer=box('#crop-layer'),rect=layer.getBoundingClientRect();
  const at=(x,y)=>({clientX:rect.left+x*rect.width,clientY:rect.top+y*rect.height});
  const send=(node,type,x,y)=>{const p=at(x,y);node.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,clientX:p.clientX,clientY:p.clientY,pointerId:1,button:0,buttons:type==='pointerup'?0:1,pointerType:'mouse',isPrimary:true}));};
  const se=box('.crop-handle[data-handle="se"]');
  send(se,'pointerdown',1,1);send(se,'pointermove',0.62,0.8);send(se,'pointerup',0.62,0.8);
  await waitFor(()=>cropsNow()['1']);
  await idle();
  out.afterDrag={crop:cropsNow()['1'],cluster:cluster(),disabled:disabled(),readout:box('#crop-readout')?.textContent,selected:[...view.selected],gridChecked:[...document.querySelectorAll('[data-page-check]')].filter(c=>c.checked).map(c=>c.dataset.pageCheck),pager:!!box('.nav-pager')};

  // 5) 应用到选中 3 页（等保存空闲后再点）
  box('[data-action="crop-selected"]').click();
  await waitFor(()=>Object.keys(cropsNow()).length===4);
  const crops=cropsNow();
  out.applySelected={pages:Object.keys(crops).sort((a,b)=>a-b),sameRect:['2','3','4'].every(k=>JSON.stringify(crops[k])===JSON.stringify(crops['1'])),selected:[...view.selected]};

  // 6) 退出裁剪模式：翻页与排除回来，裁剪控件收缩为「裁剪/还原裁剪」
  await idle();
  box('[data-action="crop-toggle"]').click();
  await raf();await wait(350);
  out.afterExit={cluster:cluster(),pager:!!box('.nav-pager'),exclude:!!box('.nav-exclude'),navHeight:Math.round(box('.full-nav').getBoundingClientRect().height),readout:box('#crop-readout')?.textContent,cropMode:!!view.crop,selected:[...view.selected],counter:box('#fullscreen-page')?.textContent};

  // 7) 拉满整页 = 没有裁剪
  await idle();
  box('[data-action="crop-toggle"]').click();await raf();await wait(300);
  view.crop={page:1,x:0,y:0,w:1,h:1};
  await commitCropFrame();
  await waitFor(()=>!cropsNow()['1']);
  out.fullFrameClears={page1Crop:cropsNow()['1']||null};
  await idle();
  box('[data-action="crop-toggle"]').click();await raf();await wait(200);

  // 清理：恢复本次开始前的裁剪状态
  await idle();
  await call('pageState',{id:pick.id,excluded:[...material().excluded],crops:backup,revision:material().revision});
  await waitFor(()=>Object.keys(cropsNow()).length===Object.keys(backup).length);
  if(modal.open)modal.close();
  view.crop=null;view.selected.clear();renderEditor();await wait(300);
  out.cleanup={thisMaterial:Object.keys(cropsNow()).length,allMaterials:state.materials.filter(m=>Object.keys(m.crops||{}).length).map(m=>m.id+':'+Object.keys(m.crops).length)};
  return JSON.stringify(out);
})()`;

console.log(JSON.stringify(await evaluate(expression), null, 2));
