// 翻页与浮层置灰：仅保留页跳过已排除页、首末页置灰、面板与浮层一致。
// 前置：用 scripts/inspect.ps1 启动开发版（带 WebView2 调试端口），再执行 node scripts/dev/check-navigation.mjs

import { evaluate } from './cdp.mjs';

const list = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const target = list.find(t => t.type === 'page' && (t.url || '').includes('5173'));
if (!target) { console.error('未找到应用页面', JSON.stringify(list.map(t => ({ type: t.type, url: t.url })))); process.exit(1); }

const expression = `(async()=>{
  const out={};
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const raf=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
  const box=s=>document.querySelector(s);
  const prevBtn=()=>box('#modal-content [data-action="previous"]');
  const nextBtn=()=>box('#modal-content [data-action="next"]');
  const panelButtons=()=>document.querySelectorAll('.preview-controls button');
  const panelPrev=()=>panelButtons()[0];
  const panelNext=()=>{const b=panelButtons();return b[b.length-1];};

  if(modal.open)modal.close();
  const mats=state.materials.filter(m=>!m.deleted);
  const withGap=mats.filter(m=>m.pages>=4&&m.excluded.length);
  const pick=(withGap[0])||mats.filter(m=>m.pages>=4).sort((a,b)=>b.pages-a.pages)[0]||mats[0];
  if(!pick)return JSON.stringify({error:'资料库中没有可用课件',materials:mats.length});
  const id=pick.id,originalExcluded=[...pick.excluded];
  out.target={id,title:pick.title,pages:pick.pages,excluded:originalExcluded};

  view.materialId=id;view.page='editor';view.selected.clear();view.undo=[];view.pageFilter='all';view.currentPage=1;
  render();await wait(40);

  let seeded=null;
  if(!material().excluded.length&&material().pages>3){seeded=[2];await mutatePages(seeded,true);await wait(80);out.seeded=seeded;}

  // E：复现用户路径——双击第 1 页放大，再点“下一页”
  view.pageFilter='all';view.currentPage=1;renderEditor();await wait(40);
  box('[data-page-tile="1"] .page-art').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}));
  await raf();await wait(80);
  out.E_dblFirstPage={page:view.currentPage,modalOpen:modal.open&&modal.classList.contains('fullscreen-modal'),prevDisabled:prevBtn().disabled,nextDisabled:nextBtn().disabled};
  nextBtn().click();await raf();await wait(80);
  out.E_afterNext={page:view.currentPage,prevDisabled:prevBtn().disabled,nextDisabled:nextBtn().disabled};

  // A/B：全部页面模式下的边界判定
  view.currentPage=1;scheduleFullscreen();await raf();await wait(60);
  out.A_allFirst={page:view.currentPage,prevDisabled:prevBtn().disabled,nextDisabled:nextBtn().disabled};
  view.currentPage=material().pages;scheduleFullscreen();await raf();await wait(60);
  out.B_allLast={page:view.currentPage,prevDisabled:prevBtn().disabled,nextDisabled:nextBtn().disabled};

  // C：仅保留页模式下翻页跳过已排除页（按真实操作顺序：先切筛选，再双击放大）
  modal.close();await wait(60);
  view.pageFilter='kept';view.currentPage=1;renderEditor();await wait(40);
  showFullscreen();await raf();await wait(60);
  const scope=pageList();
  out.C_scope=scope;
  out.C_keptFirst={page:view.currentPage,prevDisabled:prevBtn().disabled,nextDisabled:nextBtn().disabled,hint:(box('.fullscreen-shortcuts')||{}).textContent};
  nextBtn().click();await raf();await wait(80);
  out.C_afterNext={page:view.currentPage,expected:scope.find(p=>p>1)};
  prevBtn().click();await raf();await wait(80);
  out.C_afterPrev={page:view.currentPage,expected:scope.filter(p=>p<2).pop(),prevDisabled:prevBtn().disabled};

  // D：右侧预览面板按钮与浮层共用同一判定
  modal.close();await wait(80);
  view.pageFilter='kept';view.currentPage=1;renderEditor();await wait(60);
  out.D_panelKeptFirst={prevDisabled:panelPrev().disabled,nextDisabled:panelNext().disabled,keptHint:document.querySelector('.keyboard-note').textContent};
  panelNext().click();await wait(140);
  out.D_panelAfterNext={page:view.currentPage,expected:scope.find(p=>p>1)};
  view.pageFilter='all';view.currentPage=material().pages;renderEditor();await wait(40);
  out.D_panelAllLast={nextDisabled:panelNext().disabled,prevDisabled:panelPrev().disabled};

  // F：仅保留页模式下排除当前页——预览停在原页，翻页跳到范围内相邻页
  modal.close();await wait(60);
  view.pageFilter='kept';view.currentPage=3;renderEditor();await wait(40);
  showFullscreen();await raf();await wait(60);
  out.F_before={page:view.currentPage,excluded:material().excluded,toggle:box('#modal-content [data-action="toggle-fullscreen-page"]').textContent};
  box('#modal-content [data-action="toggle-fullscreen-page"]').click();
  for(let i=0;i<40&&view.saving;i++)await wait(50);
  await raf();await wait(150);
  out.F_afterExclude={page:view.currentPage,excluded:material().excluded,prevDisabled:prevBtn().disabled,nextDisabled:nextBtn().disabled,toggle:box('#modal-content [data-action="toggle-fullscreen-page"]').textContent};
  prevBtn().click();await raf();await wait(80);
  out.F_afterPrev={page:view.currentPage};
  view.currentPage=3;scheduleFullscreen();await raf();await wait(80);
  out.F_backOnExcluded={page:view.currentPage,toggle:box('#modal-content [data-action="toggle-fullscreen-page"]').textContent,prevDisabled:prevBtn().disabled};
  box('#modal-content [data-action="toggle-fullscreen-page"]').click();
  for(let i=0;i<40&&view.saving;i++)await wait(50);
  await raf();await wait(150);
  out.F_afterRestore={page:view.currentPage,excluded:material().excluded};

  // 清理：恢复本课件的排除状态与视图
  if(seeded)await mutatePages(seeded,false);
  view.pageFilter='all';view.currentPage=1;view.undo=[];renderEditor();await wait(40);
  out.cleanup={excluded:material().excluded,restored:JSON.stringify(material().excluded)===JSON.stringify(originalExcluded)};
  return JSON.stringify(out);
})()`;

console.log(JSON.stringify(await evaluate(expression), null, 2));
