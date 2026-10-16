// 裁剪数据与呈现：落库坐标、缩略图与面板同步、还原、撤销、批量应用、导出对话框统计。
// 前置：用 scripts/inspect.ps1 启动开发版（带 WebView2 调试端口），再执行 node scripts/dev/check-crop.mjs

import { evaluate } from './cdp.mjs';

const list = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const target = list.find(t => t.type === 'page' && (t.url || '').includes('5173'));
if (!target) { console.error('未找到应用页面'); process.exit(1); }

const expression = `(async()=>{
  const out={};
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const raf=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
  const box=s=>document.querySelector(s);
  const waitFor=async(check,timeout=5000)=>{const end=Date.now()+timeout;while(Date.now()<end){try{if(check())return true;}catch{}await wait(100);}return false;};
  const waitImage=async sel=>{for(let i=0;i<60;i++){const img=box(sel);if(img&&img.complete&&img.naturalWidth)return img;await wait(100);}return null;};
  const cropsNow=()=>JSON.parse(JSON.stringify(material().crops||{}));

  if(modal.open)modal.close();
  const candidates=state.materials.filter(m=>!m.deleted&&m.pages>=8&&m.kind!=='pdf');
  const pick=candidates.find(m=>!Object.keys(m.crops||{}).length)||candidates[0];
  if(!pick)return JSON.stringify({error:'没有可用的图片类课件',total:state.materials.length});
  const id=pick.id;
  const original={excluded:[...(pick.excluded||[])],crops:JSON.parse(JSON.stringify(pick.crops||{}))};
  out.material={id,title:pick.title,pages:pick.pages,cropsBefore:Object.keys(original.crops).length,excludedBefore:original.excluded.length};

  view.materialId=id;view.page='editor';view.pageFilter='all';view.currentPage=1;view.selected.clear();view.undo=[];view.crop=null;
  render();
  const tileImage=await waitImage('.page-art img.slide');
  out.imageNatural=[tileImage?.naturalWidth||0,tileImage?.naturalHeight||0];

  // 1) 双击放大并进入裁剪模式
  box('[data-page-tile="1"] .page-art').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}));
  await raf();await wait(200);
  out.open={fullscreen:modal.open&&modal.classList.contains('fullscreen-modal'),tools:!!box('.full-tools'),stageImage:!!box('#fullscreen-stage img.slide')};
  box('[data-action="crop-toggle"]').click();
  await raf();await wait(300);
  const layer=box('#crop-layer');
  if(!layer)return JSON.stringify({...out,error:'未进入裁剪模式'});
  const frame=layer.getBoundingClientRect();
  const bitmap=pageBitmapRect(box('#fullscreen-stage img.slide'));
  out.cropMode={
    frame:view.crop&&[view.crop.x,view.crop.y,view.crop.w,view.crop.h],
    handles:document.querySelectorAll('.crop-handle').length,
    layerBox:[Math.round(frame.width),Math.round(frame.height)],
    bitmapBox:bitmap&&[Math.round(bitmap.width),Math.round(bitmap.height)],
    hint:box('#fullscreen-nav-hint')?.textContent
  };

  // 2) 拖动两个手柄：se → (0.62,0.82)，nw → (0.08,0.06)
  const at=(x,y)=>({clientX:frame.left+x*frame.width,clientY:frame.top+y*frame.height});
  const send=(node,type,x,y)=>{const point=at(x,y);node.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,clientX:point.clientX,clientY:point.clientY,pointerId:1,button:0,buttons:type==='pointerup'?0:1,pointerType:'mouse',isPrimary:true}));};
  const se=box('.crop-handle[data-handle="se"]');
  send(se,'pointerdown',1,1);send(se,'pointermove',0.62,0.82);send(se,'pointerup',0.62,0.82);
  await waitFor(()=>cropsNow()['1']);
  out.afterSeDrag=cropsNow()['1'];
  const nw=box('.crop-handle[data-handle="nw"]');
  send(nw,'pointerdown',0,0);send(nw,'pointermove',0.08,0.06);send(nw,'pointerup',0.08,0.06);
  await waitFor(()=>{const r=cropsNow()['1'];return r&&Math.abs(r[0]-0.08)<0.03;});
  out.afterNwDrag=cropsNow()['1'];

  // 3) 关掉浮层，检查网格缩略图与右侧面板的呈现
  modal.close();await wait(300);
  const tileAfter=await waitImage('[data-page-tile="1"] img.slide');
  const panelImage=box('.large-art img.slide');
  const tileBox=tileAfter?.getBoundingClientRect();
  out.display={
    tile:{crop:tileAfter?.dataset.crop,clip:!!tileAfter?.style.clipPath,transform:!!tileAfter?.style.transform,flag:!!box('[data-page-tile="1"] .crop-flag'),box:tileBox&&[Math.round(tileBox.width),Math.round(tileBox.height)]},
    panel:{crop:panelImage?.dataset.crop,clip:!!panelImage?.style.clipPath},
    detail:box('.preview-detail')?.textContent,
    resetButton:!!box('.preview-detail [data-action="crop-reset"]'),
    title:box('.preview-title span')?.textContent
  };

  // 4) 面板上的“还原裁剪”
  box('.preview-detail [data-action="crop-reset"]')?.click();
  await waitFor(()=>!cropsNow()['1']);
  out.afterPanelReset={crop:cropsNow()['1']||null,tileCrop:box('[data-page-tile="1"] img.slide')?.dataset.crop||null};

  // 5) Ctrl+Z 撤销
  document.dispatchEvent(new KeyboardEvent('keydown',{key:'z',ctrlKey:true,bubbles:true}));
  await waitFor(()=>!!cropsNow()['1']);
  out.afterUndo=cropsNow()['1'];

  // 6) 进入裁剪模式后「应用到全部页」（新模式：应用类动作在裁剪模式里）
  view.crop=null;view.currentPage=1;showFullscreen();await raf();await wait(250);
  const beforeAll=Object.keys(cropsNow()).length;
  box('[data-action="crop-toggle"]').click();await raf();await wait(300);
  box('[data-action="crop-all"]').click();
  await waitFor(()=>Object.keys(cropsNow()).length===material().pages,6000);
  const all=cropsNow();
  out.applyAll={before:beforeAll,after:Object.keys(all).length,pages:material().pages,consistent:Object.values(all).every(r=>JSON.stringify(r)===JSON.stringify(all['1']))};

  // 7) 排除当前页后，导出对话框只统计保留页的裁剪
  await mutatePages([1],true);
  await waitFor(()=>material().excluded.includes(1));
  showExport();await wait(250);
  out.exportDialog={stat:box('.modal-stat')?.textContent,note:box('.modal-body p')?.textContent};
  closeModal();await wait(200);

  // 8) 真实导出不在本脚本内执行：导出尺寸由 cargo test 的 pdf 测试断言，这里只验证界面状态。\n  // 9) 清理：恢复原始排除与裁剪状态
  await call('pageState',{id,excluded:original.excluded,crops:original.crops,revision:material().revision});
  await waitFor(()=>Object.keys(cropsNow()).length===Object.keys(original.crops).length&&material().excluded.length===original.excluded.length);
  out.cleanup={crops:Object.keys(material().crops||{}).length,excluded:material().excluded};
  view.crop=null;view.filter='all';view.currentPage=1;if(view.page==='editor')renderEditor();
  return JSON.stringify(out);
})()`;

console.log(JSON.stringify(await evaluate(expression), null, 2));
