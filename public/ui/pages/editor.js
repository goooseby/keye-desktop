'use strict';

// 整理页：页面网格、右侧预览、选择与撤销、导出入口，以及整理页的键盘模型。

function renderPageEditor(){
  const m=material();if(!m)return navigate('library');
  const visible=Array.from({length:m.pages},(_,i)=>i+1).filter(p=>view.pageFilter==='all'||!m.excluded.includes(p));
  main.innerHTML=`<button class="back-button" data-nav="library">${icon('left')}返回资料库</button><div class="page-heading editor-heading"><div><h1>${esc(m.title)} <span style="font-weight:350;color:#adb5ac">/</span> ${esc(m.topic)}</h1><p class="subtitle"><span>${m.day}</span><span>·</span><span>${m.pages} 页原始页面</span><span>·</span>${badge(m)}</p></div><div class="actions"><span class="saved-label">${icon('check')}${view.saving?'正在保存…':'更改已保存'}</span><button data-action="quick-export" ${view.saving||m.pages===m.excluded.length?'disabled':''}>${icon('export')}快速导出</button><button class="primary" data-action="export" ${view.saving||m.pages===m.excluded.length?'disabled':''}>另存为…</button></div></div>
    <div class="editor-toolbar"><div class="segmented"><button data-page-filter="all" class="${view.pageFilter==='all'?'active':''}">全部页面</button><button data-page-filter="kept" class="${view.pageFilter==='kept'?'active':''}">仅保留页</button></div><span class="separator"></span><button data-action="select-all-pages">${view.selected.size===visible.length&&visible.length?'取消全选':'全选'}</button><button data-action="range">选择范围</button><button data-action="exclude" ${!view.selected.size?'disabled':''}>排除</button><button data-action="restore" ${!view.selected.size?'disabled':''}>恢复</button><span class="separator"></span><button data-action="undo" ${!view.undo.length?'disabled':''} title="撤销上次排除或恢复">${icon('undo')}撤销</button><span class="selected-label">已选中 ${view.selected.size} 页</span></div>
    <div class="editor-layout"><section><div class="pages-grid">${visible.map(p=>`<article class="page-tile ${m.excluded.includes(p)?'excluded':''} ${view.selected.has(p)?'selected':''} ${view.currentPage===p?'current':''}" data-page-tile="${p}"><label class="page-check"><input type="checkbox" data-page-check="${p}" aria-label="选中第 ${p} 页" ${view.selected.has(p)?'checked':''}></label><div class="page-art" tabindex="0" role="button" aria-label="预览第 ${p} 页，双击放大" data-preview="${p}">${slide(m,p,true)}</div><div class="page-caption"><strong>${String(p).padStart(2,'0')}</strong>${cropOf(m,p)?`<span class="crop-flag" title="已裁剪">${icon('crop')}已裁剪</span>`:''}<button data-toggle-page="${p}">${m.excluded.includes(p)?'恢复此页':'排除此页'}</button></div></article>`).join('')}</div>${!visible.length?empty('没有保留的页面','切换到全部页面，可以恢复之前排除的内容。','<button data-page-filter="all">查看全部页面</button>'):''}</section>
    <aside class="preview-panel"><div class="preview-title">页面预览 <span>原始页 ${view.currentPage} / ${m.pages}${cropOf(m,view.currentPage)?' · 已裁剪':''}</span><button class="icon-button" data-action="fullscreen" title="放大页面" aria-label="放大页面">${icon('expand')}</button></div><div class="large-art" data-action="fullscreen">${slide(m,view.currentPage)}</div><div class="preview-controls"><button class="icon-button" data-action="previous" ${stepTarget(-1)===null?'disabled':''} aria-label="上一页">${icon('left')}</button><span>第 ${view.currentPage} 页</span><button class="icon-button" data-action="next" ${stepTarget(1)===null?'disabled':''} aria-label="下一页">${icon('right')}</button></div><div class="preview-detail">${previewDetailHtml(m,view.currentPage)}</div><div class="keyboard-note"><kbd>←</kbd> <kbd>→</kbd> 翻页${view.pageFilter==='kept'?'（跳过已排除页）':''}　<kbd>E</kbd> 排除 / 恢复<br><kbd>Ctrl</kbd> + <kbd>Z</kbd> 撤销　双击缩略图放大后可裁剪</div></aside></div>
    <div class="editor-summary"><span>共 ${m.pages} 页 <span style="color:#c4cbc4">/</span> <strong>保留 ${m.pages-m.excluded.length} 页</strong> <span style="color:#c4cbc4">/</span> 排除 ${m.excluded.length} 页${cropCount(m)?` <span style="color:#c4cbc4">/</span> 裁剪 ${cropCount(m)} 页`:''}</span><span>排除不会删除原始图片，裁剪也保留原始画面</span></div>`;
}
function previewDetailHtml(m,page){
  const excluded=m.excluded.includes(page),crop=cropOf(m,page);
  const copy=excluded?'原始页面依然保留。恢复后，这一页将重新进入导出结果。':crop?'此页已裁剪，导出使用裁剪后的画面；原始画面依然保留。':'单击缩略图查看大图；勾选多页，可以批量排除无关画面。';
  return `<h3>${excluded?'此页已排除':crop?'此页已裁剪':'此页将保留在 PDF 中'}</h3><p>${copy}</p><div class="preview-detail-actions"><button class="${excluded?'secondary':''}" data-toggle-page="${page}">${excluded?icon('undo')+'恢复此页':icon('close')+'排除此页'}</button>${crop?`<button data-action="crop-reset">${icon('crop')}还原裁剪</button>`:''}</div>`;
}

function renderEditor(){
  renderPageEditor();const m=material();if(!m)return;
  const c=courseById(m.courseId),queue=queueMaterials();
  const items=queue.some(x=>x.id===m.id)?queue:sessions(m.courseId||'unfiled');
  const index=items.findIndex(x=>x.id===m.id);
  main.querySelector('.back-button').dataset.nav='course/'+(m.courseId||'unfiled');
  main.querySelector('.back-button').innerHTML=icon('left')+'返回 '+esc(c.title);
  const completion=document.createElement('div');completion.className='review-completion';
  completion.innerHTML=`<span>${reviewed(m)?'已确认这份课件整理完成':'确认本次课的页面后，再继续下一份。'} · ${exportBadge(m)}</span><button class="primary" data-course-action="complete" ${view.saving?'disabled':''}>${index<items.length-1?'标记已整理，处理下一份':'标记已整理，返回课程'}</button>`;
  main.append(completion);
}

let editorImageRequest=0;
let lastPageTimer=null;
let pendingLastPage=null;
function syncSelectionUi(){
  const pages=pageList();
  document.querySelectorAll('[data-page-tile]').forEach(tile=>tile.classList.toggle('selected',view.selected.has(Number(tile.dataset.pageTile))));
  document.querySelectorAll('[data-page-check]').forEach(input=>{input.checked=view.selected.has(Number(input.dataset.pageCheck));});
  const selectAll=$('[data-action="select-all-pages"]');
  if(selectAll)selectAll.textContent=view.selected.size===pages.length&&pages.length?'取消全选':'全选';
  const exclude=$('[data-action="exclude"]'),restore=$('[data-action="restore"]');
  if(exclude)exclude.disabled=!view.selected.size;
  if(restore)restore.disabled=!view.selected.size;
  const label=$('.editor-toolbar .selected-label');
  if(label)label.textContent=`已选中 ${view.selected.size} 页`;
}
async function commitPageState(excluded,crops,message,clearSelection=false){
  const m=material(),before={excluded:[...m.excluded],crops:JSON.parse(JSON.stringify(cropsOf(m)))};
  if(JSON.stringify(before.excluded)===JSON.stringify(excluded)&&JSON.stringify(before.crops)===JSON.stringify(crops))return false;
  const fullscreenOpen=modal.open&&modal.classList.contains('fullscreen-modal');
  view.saving=true;if(!fullscreenOpen)renderEditor();
  try{
    await call('pageState',{id:m.id,excluded,crops,revision:m.revision});
    if(view.materialId===m.id)view.undo.push(before);
    if(clearSelection){view.selected.clear();view.selectionAnchor=null;}
    if(message)toast(message);else flashCropSaved();
  }
  finally{view.saving=false;if(fullscreenOpen)scheduleFullscreen();else render();}
  return true;
}
async function mutatePages(pages,exclude){
  if(view.saving)return toast('正在保存上次修改，请稍候。');
  const m=material(),set=new Set(m.excluded);
  pages.forEach(p=>exclude?set.add(p):set.delete(p));
  await commitPageState([...set].sort((a,b)=>a-b),cropsOf(m),exclude?'已排除所选页面，原始素材仍保留':'所选页面已恢复',true);
}
async function commitCrop(crops,message){
  if(view.saving)return toast('正在保存上次修改，请稍候。');
  return commitPageState([...material().excluded],crops,message);
}
async function applyCrop(rect,message){
  const m=material(),crops={...cropsOf(m)};
  if(rect)crops[String(view.currentPage)]=rect;else delete crops[String(view.currentPage)];
  await commitCrop(crops,message);
}
async function undo(){
  if(view.saving||!view.undo.length)return;
  const m=material(),snapshot=view.undo[view.undo.length-1],fullscreenOpen=modal.open&&modal.classList.contains('fullscreen-modal');view.saving=true;
  try{await call('pageState',{id:m.id,excluded:snapshot.excluded,crops:snapshot.crops||{},revision:m.revision});view.undo.pop();view.selected.clear();toast('已撤销上次页面操作');}
  finally{view.saving=false;if(fullscreenOpen)scheduleFullscreen();else render();}
}
function updateEditorPreview(){
  const m=material(),panel=document.querySelector('.preview-panel');
  if(!m||!panel)return renderEditor();
  document.querySelectorAll('[data-page-tile].current').forEach(tile=>tile.classList.remove('current'));
  document.querySelector(`[data-page-tile="${view.currentPage}"]`)?.classList.add('current');
  panel.querySelector('.preview-title span').textContent=`原始页 ${view.currentPage} / ${m.pages}`;
  const stage=panel.querySelector('.large-art'),image=stage.querySelector('img.slide'),media=m.media?.[view.currentPage-1];
  if(media&&image&&image.src!==media.src){
    const request=++editorImageRequest,page=view.currentPage,loader=new Image();
    stage.setAttribute('aria-busy','true');loader.decoding='async';loader.src=media.src;
    const commit=()=>{if(request!==editorImageRequest||view.currentPage!==page||!image.isConnected)return;image.src=media.src;image.alt=`${m.title} · 第 ${page} 页`;stage.removeAttribute('aria-busy');syncImageCrop(image,material(),view.currentPage);applyCropViews();};
    if(loader.decode)loader.decode().then(commit).catch(commit);else loader.onload=commit;
  }else if(media&&image){++editorImageRequest;stage.removeAttribute('aria-busy');}
  else stage.innerHTML=slide(m,view.currentPage);
  syncImageCrop(image,m,view.currentPage);
  const controls=panel.querySelector('.preview-controls'),buttons=controls.querySelectorAll('button');
  buttons[0].disabled=stepTarget(-1)===null;controls.querySelector('span').textContent=`第 ${view.currentPage} 页`;buttons[1].disabled=stepTarget(1)===null;
  panel.querySelector('.preview-detail').innerHTML=previewDetailHtml(m,view.currentPage);
  applyCropViews();
  fullscreenPreloads=[view.currentPage-1,view.currentPage+1].map(page=>m.media?.[page-1]?.src).filter(Boolean).map(src=>{const preload=new Image();preload.src=src;return preload;});
}
function preview(page){
  const m=material();view.currentPage=Math.max(1,Math.min(m.pages,page));m.lastPage=view.currentPage;
  pendingLastPage={id:m.id,page:view.currentPage};clearTimeout(lastPageTimer);
  lastPageTimer=setTimeout(()=>{const latest=pendingLastPage;pendingLastPage=null;if(latest)call('lastPage',latest).catch(fail);},240);
  if(modal.open&&modal.classList.contains('fullscreen-modal'))scheduleFullscreen();else updateEditorPreview();
}
function stepPage(step){const target=stepTarget(step);if(target!==null)preview(target);}
function showExport(){
  const m=material(),kept=m.pages-m.excluded.length,croppedKept=cropCount(m,true);if(!kept||view.saving)return;
  showModal('导出 PDF',`<p>将按原始页序，合并当前保留的页面；已裁剪的页面按裁剪后的画面导出。导出期间继续修改，不会影响本次输出。</p><div class="modal-stat"><div><strong>${m.pages}</strong><span>原始页面</span></div><div><strong>${kept}</strong><span>保留并导出</span></div><div><strong>${m.excluded.length}</strong><span>已排除</span></div>${croppedKept?`<div><strong>${croppedKept}</strong><span>已裁剪</span></div>`:''}</div><label class="field">文件名称<input type="text" id="export-name" value="${esc(m.day+'_'+m.title+'.pdf')}" maxlength="120"></label><p>下一步选择文件保存位置，完成后可在任务页打开输出目录。</p>`, '<button data-action="close-modal">取消</button><button class="primary" data-action="confirm-export">选择位置并导出</button>');
}
document.addEventListener('dblclick',event=>{const el=event.target.closest('[data-preview]');if(el){clearTimeout(preview.timer);view.currentPage=Number(el.dataset.preview);preview(view.currentPage);showFullscreen();}});
document.addEventListener('keydown',event=>{
  if(view.page!=='editor'||['INPUT','SELECT','TEXTAREA'].includes(event.target.tagName))return;
  if(event.key==='Enter'&&event.target.matches?.('[data-preview]')){view.currentPage=Number(event.target.dataset.preview);showFullscreen();return;}
  if(modal.open&&!modal.classList.contains('fullscreen-modal'))return;
  if(view.crop){
    if(event.key==='Escape'||event.key==='Enter'){event.preventDefault();return exitCropMode();}
    if(event.key.startsWith('Arrow')){
      event.preventDefault();
      const layer=$('#crop-layer'),box=layer?.getBoundingClientRect();if(!box)return;
      const step=event.shiftKey?10:1;
      const moveX=event.key==='ArrowLeft'?-step/box.width:event.key==='ArrowRight'?step/box.width:0;
      const moveY=event.key==='ArrowUp'?-step/box.height:event.key==='ArrowDown'?step/box.height:0;
      const crop=view.crop,next=clampCrop({x:crop.x+moveX,y:crop.y+moveY,w:crop.w,h:crop.h},layer,false);
      view.crop={page:view.currentPage,...next};paintCropBox();updateCropReadout();
      clearTimeout(cropNudgeTimer);cropNudgeTimer=setTimeout(()=>commitCropFrame().catch(fail),400);
      return;
    }
  }
  if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();stepPage(event.key==='ArrowLeft'?-1:1);}
  if(event.key.toLowerCase()==='e'&&!event.ctrlKey&&!event.metaKey&&!view.crop){mutatePages([view.currentPage],!material().excluded.includes(view.currentPage)).catch(fail);}
  if(event.key.toLowerCase()==='c'&&!event.ctrlKey&&!event.metaKey&&!view.crop){toggleCropMode();return;}
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){event.preventDefault();undo().then(()=>{if(modal.open)scheduleFullscreen();}).catch(fail);}
});
modal.addEventListener('close',()=>{modal.classList.remove('fullscreen-modal');view.crop=null;cropGesture=null;if(view.page==='editor')renderEditor();});

// —— 整理页的动作注册 ——
registerDataHandlers({
  pageFilter:element=>{view.pageFilter=element.dataset.pageFilter;view.selected.clear();view.selectionAnchor=null;renderEditor();},
  togglePage:element=>{const page=Number(element.dataset.togglePage);return mutatePages([page],!material().excluded.includes(page));},
});
registerActions({
  'select-all-pages':()=>{const m=material(),pages=Array.from({length:m.pages},(_,i)=>i+1).filter(p=>view.pageFilter==='all'||!m.excluded.includes(p));view.selected=view.selected.size===pages.length?new Set():new Set(pages);view.selectionAnchor=null;syncSelectionUi();},
  range:()=>showModal('选择连续页面',`<p>使用原始页码选择，再批量排除或恢复。</p><div class="range-fields"><label class="field">从第几页<input type="number" id="range-from" min="1" max="${material().pages}" value="${view.currentPage}"></label><label class="field">到第几页<input type="number" id="range-to" min="1" max="${material().pages}" value="${Math.min(material().pages,view.currentPage+3)}"></label></div>`, '<button data-action="close-modal">取消</button><button class="primary" data-action="confirm-range">选中这些页面</button>'),
  'confirm-range':()=>{const from=Number($('#range-from').value),to=Number($('#range-to').value);if(!Number.isInteger(from)||!Number.isInteger(to)||from<1||to>material().pages||from>to)return toast('请输入有效的页面范围。');view.pageFilter='all';view.selected=new Set(Array.from({length:to-from+1},(_,i)=>i+from));view.selectionAnchor=to;closeModal();renderEditor();},
  exclude:()=>mutatePages([...view.selected],true),
  restore:()=>mutatePages([...view.selected],false),
  undo:()=>undo(),
  previous:()=>stepPage(-1),
  next:()=>stepPage(1),
  fullscreen:()=>showFullscreen(),
  'toggle-fullscreen-page':async()=>{await mutatePages([view.currentPage],!material().excluded.includes(view.currentPage));},
  export:()=>showExport(),
  'quick-export':async()=>{await submitExport('quickExport',{id:material().id},'PDF 导出完成，可在任务页打开输出目录。');},
  'confirm-export':async()=>{const id=material().id,name=$('#export-name').value.trim();if(!name)return toast('请填写文件名。');closeModal();await submitExport('export',{id,name},'PDF 导出完成，可在任务页打开输出目录。');},
});

// 复选框勾选：只更新相关 DOM（不重建网格），避免已裁切的缩略图闪回未裁剪画面
registerDataChanges({
  pageCheck:element=>{
    const page=Number(element.dataset.pageCheck),checked=element.checked;
    if(view.pageShiftPending&&view.selectionAnchor!==null){
      const from=Math.min(view.selectionAnchor,page),to=Math.max(view.selectionAnchor,page),m=material();
      for(let p=from;p<=to;p++)if(view.pageFilter==='all'||!m.excluded.includes(p))checked?view.selected.add(p):view.selected.delete(p);
    }else checked?view.selected.add(page):view.selected.delete(page);
    view.selectionAnchor=page;view.pageShiftPending=false;syncSelectionUi();
  },
});
