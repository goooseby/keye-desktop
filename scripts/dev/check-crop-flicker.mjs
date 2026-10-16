// 裁剪闪烁：勾选时不重建网格、重渲染在同一任务内补齐样式、未就绪先隐藏。
// 前置：用 scripts/inspect.ps1 启动开发版（带 WebView2 调试端口），再执行 node scripts/dev/check-crop-flicker.mjs

import { evaluate } from './cdp.mjs';

// 判据（无需截图）：点击后在同一任务内，裁切缩略图的 DOM 节点是否被重建、裁剪样式是否已就绪。
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

  if(modal.open)modal.close();
  const pick=state.materials.filter(m=>!m.deleted&&m.kind!=='pdf'&&m.pages>=8).sort((a,b)=>b.pages-a.pages)[0];
  const id=pick.id,backup={excluded:[...(pick.excluded||[])],crops:JSON.parse(JSON.stringify(pick.crops||{}))};
  view.materialId=id;view.page='editor';view.pageFilter='all';view.currentPage=1;view.selected.clear();view.undo=[];view.crop=null;render();
  await waitFor(()=>box('.page-art img.slide')?.naturalWidth);

  // 注入两页裁剪并渲染网格
  pick.crops={'1':[0.16,0.12,0.6,0.7],'2':[0.1,0.1,0.5,0.5]};
  renderEditor();await raf();await wait(400);
  const img1=box('[data-page-tile="1"] img.slide');
  const before={clip:img1.style.clipPath,transform:img1.style.transform,ready:img1.dataset.cropReady};
  out.baseline={hasClip:!!before.clip,ready:before.ready,visibility:getComputedStyle(img1).visibility};

  // 判据 1：点另一页的勾选框——同一任务内，裁切缩略图的节点与样式必须原封不动
  const input=box('[data-page-check="3"]');input.checked=true;
  input.dispatchEvent(new Event('change',{bubbles:true}));
  const img1AfterClick=box('[data-page-tile="1"] img.slide');
  out.afterCheckboxClick={
    sameNode:img1AfterClick===img1,
    styleKept:img1AfterClick.style.clipPath===before.clip&&img1AfterClick.style.clipPath!=='',
    ready:img1AfterClick.dataset.cropReady,
    unreadyCount:document.querySelectorAll('img.slide[data-crop]:not([data-crop-ready="1"])').length,
    selected:[...view.selected],
    label:box('.editor-toolbar .selected-label')?.textContent
  };

  // 判据 2：确实会重渲染的路径（排除一页）——返回时新节点的裁剪样式必须已就绪
  const oldNode=box('[data-page-tile="1"] img.slide');
  await mutatePages([55],true);
  await waitFor(()=>material().excluded.includes(55));
  await idle();
  const newNode=box('[data-page-tile="1"] img.slide');
  out.afterRerender={
    nodeRebuilt:newNode!==oldNode,
    clipReadySynchronously:!!newNode.style.clipPath,
    ready:newNode.dataset.cropReady,
    visibility:getComputedStyle(newNode).visibility,
    unreadyCount:document.querySelectorAll('img.slide[data-crop]:not([data-crop-ready="1"])').length
  };
  await mutatePages([55],false);
  await waitFor(()=>!material().excluded.includes(55));

  // 判据 3：CSS 兜底——未就绪的裁切图在样式补齐前是隐藏的（不可能露出未裁剪画面）
  const live=box('[data-page-tile="1"] img.slide');
  live.removeAttribute('data-crop-ready');
  out.guard={hiddenWhileUnready:getComputedStyle(live).visibility==='hidden'};
  applyCropViews();
  out.guard.visibleAfterReapply=getComputedStyle(live).visibility==='visible'&&live.dataset.cropReady==='1';

  // 判据 4：全部页面都裁剪时，同步补齐样式的耗时（不能卡）
  for(let page=1;page<=pick.pages;page++)pick.crops[String(page)]=[0.16,0.12,0.6,0.7];
  const started=performance.now();
  renderEditor();
  const elapsed=performance.now()-started;
  out.massCrop={pages:pick.pages,renderAndApplyMs:Math.round(elapsed),unreadyCount:document.querySelectorAll('img.slide[data-crop]:not([data-crop-ready="1"])').length};
  await raf();await wait(200);

  // 清理：恢复状态
  pick.crops=backup.crops;
  await call('pageState',{id,excluded:backup.excluded,crops:backup.crops,revision:material().revision});
  await waitFor(()=>Object.keys(material().crops||{}).length===Object.keys(backup.crops).length);
  view.selected.clear();renderEditor();
  out.cleanup={crops:Object.keys(material().crops||{}).length,excluded:material().excluded.length};
  return JSON.stringify(out,null,2);
})()`;

console.log(JSON.stringify(await evaluate(expression), null, 2));
