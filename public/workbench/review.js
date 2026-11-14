'use strict';

// Preserve the original review model: page grid, side preview, enlarged viewer.
const reviewUi = { selected:new Set(), anchor:null, scrolls:new Map(), shift:false };
const reviewPages = () => Array.from({length:currentFile().pages},(_,n)=>n+1).filter(page=>!ui.onlyKept||!currentFile().excluded.has(page));
const viewerOpen = () => document.querySelector('#viewer').open;

function captureReviewScroll() {
  const grid=document.querySelector('.review-pages');
  if(grid){reviewUi.scrolls.set(grid.dataset.scrollKey,grid.scrollTop);if(WorkbenchBusiness.enabled)ReviewMedia.capture(grid);}
}
function refreshReview() {
  captureReviewScroll();
  render();
}
function pageReviewHeading(file) {
  const kept=file.pages-file.excluded.size;
  const queue=WorkbenchBusiness.enabled?WorkbenchBusiness.reviewContext(file):{active:false};
  const done=file.review==='done',label=queue.active?(queue.next?'完成并继续':'完成并返回'):done?'已完成整理':'完成整理';
  return `<div class="page-heading editor-heading">
    <div><h1>${escapeHtml(file.title)}</h1><p>${escapeHtml(courseOf(file).name)}　/　${file.date}　/　${file.pages} 页${queue.active?`　·　连续整理 ${queue.index+1} / ${queue.total}`:''}</p></div>
    <div class="actions"><span class="save-state">${icon(WorkbenchBusiness.enabled&&WorkbenchBusiness.busy?'clock':'check')}${WorkbenchBusiness.enabled?(WorkbenchBusiness.busy?'正在保存…':'更改已保存'):'预览已暂存'}</span>
      ${button('导出 PDF','export-current','export','button',kept?'':'disabled')}
      ${button(label,'complete','check',done&&!queue.active?'button completion-button':'primary',done&&!queue.active?'disabled':'')}
    </div>
  </div>`;
}
function renderEditor() {
  const file=currentFile(), pages=reviewPages(), count=reviewUi.selected.size;
  document.querySelector('#page').innerHTML=pageReviewHeading(file)+`
    <div class="toolbar review-toolbar">
      <div class="filter-tabs">
        ${button('全部页面','page-filter-all','',ui.onlyKept?'':'active')}
        ${button('仅保留页','page-filter-kept','',ui.onlyKept?'active':'')}
      </div><i class="separator"></i>
      ${button(count&&pages.every(page=>reviewUi.selected.has(page))?'取消全选':'全选','select-pages')}
      ${button('选择范围','page-range','range')}
      ${button('排除','exclude-selected','minus','button',count?'':'disabled')}
      ${button('恢复','restore-selected-pages','refresh','button',count?'':'disabled')}
      <i class="separator"></i>${button('撤销','undo','undo','',file.history.length?'':'disabled')}
      <span class="spacer"></span><span class="selection-summary ${count?'has-selection':''}">${count?`已选 ${count} 页`:'先勾选页面，再批量操作'}</span>
      ${count?iconButton('close','清空页面选择','clear-pages'):''}
    </div>
    <div class="review-layout">
      <section class="review-pages" aria-label="课件页面网格"><div class="review-grid">
        ${pages.map(page=>reviewTile(file,page)).join('')}
      </div>${!pages.length?`<div class="empty">${icon('files')}<h2>当前没有保留页面</h2><p>原始页面完整保留，切回全部页面即可恢复。</p><div>${button('查看全部页面','page-filter-all','','button')}</div></div>`:''}</section>
      <aside class="review-preview" aria-label="当前页面预览">${previewMarkup(file)}</aside>
    </div>`;
  const grid=document.querySelector('.review-pages'),key=file.id+':'+ui.onlyKept;
  grid.dataset.scrollKey=key;grid.dataset.fileId=file.id;grid.scrollTop=reviewUi.scrolls.get(key)||0;
  document.querySelector('.review-preview').dataset.page=ui.current;
  if(WorkbenchBusiness.enabled){ReviewMedia.hydrate(grid,file);ReviewMedia.preview(document.querySelector('.preview-art'),file,ui.current);}
  if(viewerOpen())renderViewer();
}
function reviewTile(file,page) {
  const excluded=file.excluded.has(page), selected=reviewUi.selected.has(page);
  return `<article class="review-tile ${page===ui.current?'current':''} ${selected?'selected':''} ${excluded?'excluded':''}" data-page-tile="${page}">
    <label class="review-check"><input type="checkbox" data-page-check="${page}" aria-label="选择第 ${page} 页" ${selected?'checked':''} ${WorkbenchBusiness.enabled&&WorkbenchBusiness.missing(file,page)?'disabled':''}></label>
    ${page===ui.current?'<span class="current-page-label">当前页</span>':excluded?'<span class="excluded-page-label">已排除</span>':''}
    <button class="review-art" data-preview="${page}" aria-label="预览第 ${page} 页，双击放大" aria-current="${ui.current===page}">${WorkbenchBusiness.enabled?ReviewMedia.canvas():slideSvg(file,page,true,true)}</button>
    <div class="review-caption"><strong>${String(page).padStart(2,'0')}</strong>${file.crops.has(page)?`<span class="crop-label">${icon('crop')}已裁剪</span>`:''}
      <span class="spacer"></span><button data-toggle-page="${page}" ${WorkbenchBusiness.enabled&&WorkbenchBusiness.missing(file,page)?'disabled':''}>${WorkbenchBusiness.enabled&&WorkbenchBusiness.missing(file,page)?'此页缺失':excluded?'恢复':'排除此页'}</button>
    </div>
  </article>`;
}
function previewMarkup(file) {
  const page=ui.current, excluded=file.excluded.has(page), crop=file.crops.has(page);
  return `<div class="panel-heading">页面预览${iconButton('fit','放大当前页','fullscreen')}</div>
    <button class="preview-art" data-action="fullscreen" aria-label="放大当前页">${WorkbenchBusiness.enabled?ReviewMedia.canvas():slideSvg(file,page)}</button>
    <div class="preview-pager">${button('','previous','left','icon-button',stepTarget(-1)===null?'disabled aria-label="上一页"':'aria-label="上一页"')}
      <span>第 <strong>${page}</strong> / ${file.pages} 页</span>${button('','next','right','icon-button',stepTarget(1)===null?'disabled aria-label="下一页"':'aria-label="下一页"')}</div>
    <div class="preview-description"><span class="page-state ${excluded?'excluded':''}">${icon(excluded?'minus':'circleCheck')}${excluded?'此页已排除':'此页保留在 PDF 中'}</span>
      <p>${excluded?'恢复后重新进入导出结果，原始画面始终保留。':crop?'当前预览已应用裁剪，原始画面可随时还原。':'单击缩略图预览，双击放大查看；放大后可裁剪。'}</p>
      ${button(excluded?'恢复此页':'排除此页','exclude',excluded?'refresh':'minus','button wide')}
      ${crop?button('还原裁剪','reset-crop','undo','text-button wide'):''}
    </div>
    <div class="preview-description"><h3>导出范围</h3><div class="kept-count"><strong>${file.pages-file.excluded.size}</strong><small>/ ${file.pages} 页</small></div>
      <p>整理状态与导出状态独立，可以随时导出当前保留页。</p></div>
    <div class="shortcuts"><kbd>←</kbd> <kbd>→</kbd> 翻页　<kbd>E</kbd> 排除 / 恢复<br><kbd>Shift</kbd> 连选　<kbd>Ctrl Z</kbd> 撤销</div>`;
}
function selectPage(page) {
  if(!Number.isFinite(page))return;
  ui.current=Math.max(1,Math.min(currentFile().pages,Math.trunc(page)));
  currentFile().lastPage=ui.current;
  if(WorkbenchBusiness.enabled)WorkbenchBusiness.pageVisited(ui.openFile,ui.current);
  if(viewerOpen()){ui.crop=null;renderViewer();}
  else {
    document.querySelectorAll('[data-page-tile]').forEach(tile=>{
      tile.classList.toggle('current',Number(tile.dataset.pageTile)===ui.current);
      tile.querySelector('[data-preview]').setAttribute('aria-current',String(Number(tile.dataset.pageTile)===ui.current));
      tile.querySelector('.current-page-label')?.remove();
      if(Number(tile.dataset.pageTile)===ui.current){tile.querySelector('.excluded-page-label')?.remove();tile.insertAdjacentHTML('beforeend','<span class="current-page-label">当前页</span>');}
      else if(currentFile().excluded.has(Number(tile.dataset.pageTile))&&!tile.querySelector('.excluded-page-label'))tile.insertAdjacentHTML('beforeend','<span class="excluded-page-label">已排除</span>');
    });
    const panel=document.querySelector('.review-preview');
    if(panel){
      const focus=WorkbenchMotion.focusKey(panel),changed=Number(panel.dataset.page)!==ui.current;
      const artwork=WorkbenchBusiness.enabled?panel.querySelector('.preview-art'):null;
      panel.innerHTML=previewMarkup(currentFile());panel.dataset.page=ui.current;
      if(artwork){panel.querySelector('.preview-art').replaceWith(artwork);ReviewMedia.preview(artwork,currentFile(),ui.current);}
      WorkbenchMotion.restoreFocus(panel,focus,'fullscreen');
      if(changed&&!WorkbenchBusiness.enabled)WorkbenchMotion.play(panel.querySelector('.preview-art'),[{opacity:.75},{opacity:1}],120);
    }
  }
  syncReviewStatus();
}
function syncReviewStatus() {
  const status=document.querySelector('.app-status');
  if(status&&ui.page==='editor')status.querySelectorAll('span')[1].textContent=`第 ${ui.current} 页 · 保留 ${currentFile().pages-currentFile().excluded.size} / ${currentFile().pages} 页`;
}
function stepTarget(delta) {
  let page=ui.current+delta;
  while(ui.onlyKept&&currentFile().excluded.has(page))page+=delta;
  return page>=1&&page<=currentFile().pages?page:null;
}
function stepPage(delta) {
  const page=stepTarget(delta);if(page===null||ui.crop)return;
  selectPage(page);
  if(!viewerOpen())document.querySelector(`[data-page-tile="${page}"]`)?.scrollIntoView({block:'nearest'});
}
function setPageFilter(kept) {
  ui.onlyKept=kept;
  reviewUi.selected=new Set([...reviewUi.selected].filter(page=>!kept||!currentFile().excluded.has(page)));
  reviewUi.scrolls.set(currentFile().id+':'+kept,0);render();
}
function selectReviewPage(page,checked,shift) {
  const pages=reviewPages();
  const from=pages.indexOf(reviewUi.anchor),to=pages.indexOf(page);
  const range=shift&&from>=0?pages.slice(Math.min(from,to),Math.max(from,to)+1):[page];
  range.filter(page=>!WorkbenchBusiness.enabled||!WorkbenchBusiness.missing(currentFile(),page)).forEach(page=>checked?reviewUi.selected.add(page):reviewUi.selected.delete(page));
  reviewUi.anchor=page;syncReviewSelection();
}
function syncReviewSelection(){
  const count=reviewUi.selected.size,pages=reviewPages().filter(page=>!WorkbenchBusiness.enabled||!WorkbenchBusiness.missing(currentFile(),page));
  document.querySelectorAll('[data-page-tile]').forEach(tile=>tile.classList.toggle('selected',reviewUi.selected.has(Number(tile.dataset.pageTile))));
  document.querySelectorAll('[data-page-check]').forEach(input=>input.checked=reviewUi.selected.has(Number(input.dataset.pageCheck)));
  document.querySelector('[data-action="select-pages"]').textContent=count&&pages.every(page=>reviewUi.selected.has(page))?'取消全选':'全选';
  for(const name of ['exclude-selected','restore-selected-pages'])document.querySelector(`[data-action="${name}"]`).disabled=!count;
  const summary=document.querySelector('.selection-summary');summary.classList.toggle('has-selection',!!count);summary.textContent=count?`已选 ${count} 页`:'先勾选页面，再批量操作';
  let clear=document.querySelector('[data-action="clear-pages"]');
  if(count&&!clear)summary.insertAdjacentHTML('afterend',iconButton('close','清空页面选择','clear-pages'));
  else if(!count&&clear)clear.remove();
  const cropSelected=document.querySelector('[data-action="crop-selected"]');if(cropSelected){cropSelected.disabled=!count;cropSelected.textContent=`应用到选中 ${count} 页`;}
}
function toggleAllPages() {
  const pages=reviewPages().filter(page=>!WorkbenchBusiness.enabled||!WorkbenchBusiness.missing(currentFile(),page));
  reviewUi.selected=pages.length&&pages.every(page=>reviewUi.selected.has(page))?new Set():new Set(pages);
  syncReviewSelection();
}
function showPageRange() {
  showDialog('选择页面范围',`<p>使用原始页码，例如：1-5, 8, 12-16。${ui.onlyKept?'当前仅选择范围内的保留页面。':''}</p><label>页码范围<input id="page-range" placeholder="1-5, 8, 12-16" autocomplete="off"></label><p id="range-error" class="field-error" role="alert"></p>`,button('取消','close-dialog','','button')+button('选择页面','confirm-page-range','check','primary'));
}
function confirmPageRange() {
  const text=document.querySelector('#page-range').value.trim();
  const parts=text.replaceAll('，',',').replaceAll('–','-').split(/[,\s]+/).filter(Boolean), result=new Set();
  let error='';
  if(!parts.length)error='请输入需要选择的页码。';
  for(const part of parts){
    const match=part.match(/^(\d+)(?:-(\d+))?$/);
    if(!match){error=`无法识别「${part}」，请使用 1-5, 8 这样的格式。`;break;}
    const from=Number(match[1]),to=Number(match[2]||match[1]);
    if(from<1||to>currentFile().pages||from>to){error=`页码必须在 1–${currentFile().pages} 之间，且起始页不大于结束页。`;break;}
    for(let page=from;page<=to;page++)if((!ui.onlyKept||!currentFile().excluded.has(page))&&(!WorkbenchBusiness.enabled||!WorkbenchBusiness.missing(currentFile(),page)))result.add(page);
  }
  if(!error&&!result.size)error='该范围内没有当前可选页面。';
  if(error){document.querySelector('#range-error').textContent=error;return;}
  reviewUi.selected=result;dialog.close();syncReviewSelection();
}
function recordChange() {
  const file=currentFile();
  file.history.push({excluded:new Set(file.excluded),crops:new Map([...file.crops].map(([page,rect])=>[page,{...rect}])),review:file.review,exported:file.exported});
  if(file.review==='done')file.review='reviewing';
  file.exported=false;
}
function mutatePages(pages,excluded) {
  const file=currentFile(), changed=pages.filter(page=>page>=1&&page<=file.pages&&file.excluded.has(page)!==excluded&&(!WorkbenchBusiness.enabled||!WorkbenchBusiness.missing(file,page)));
  if(!changed.length)return;
  if(WorkbenchBusiness.enabled){const next=new Set(file.excluded);changed.forEach(page=>excluded?next.add(page):next.delete(page));return WorkbenchBusiness.commit(file,next,file.crops);}
  recordChange();changed.forEach(page=>excluded?file.excluded.add(page):file.excluded.delete(page));
  reviewUi.selected.clear();ui.crop=null;refreshReview();
}
function setExcluded(excluded) {mutatePages([ui.current],excluded);}
function undo() {
  if(WorkbenchBusiness.enabled){const file=currentFile(),previous=file.history.at(-1);if(previous)return WorkbenchBusiness.commit(file,previous.excluded,previous.crops,{undo:true,finish:true});return;}
  const file=currentFile(), previous=file.history.pop();if(!previous)return;
  Object.assign(file,previous);reviewUi.selected.clear();ui.crop=null;refreshReview();
  notify('已撤销上次页面操作。');
}
function showViewer() {
  const viewer=document.querySelector('#viewer');
  renderViewer();if(!viewer.open)viewer.showModal();
  fitViewer();
}
function closeViewer() {
  const viewer=document.querySelector('#viewer');
  if(!viewer?.open)return;
  ui.crop=null;canvasObserver?.disconnect();viewer.close();
  if(ui.page==='editor')selectPage(ui.current);
  document.querySelector(`[data-preview="${ui.current}"]`)?.focus({preventScroll:true});
}
function renderViewer() {
  const file=currentFile(), viewer=document.querySelector('#viewer'), cropping=!!ui.crop;
  const focus=WorkbenchMotion.focusKey(viewer),oldMode=viewer.dataset.cropping;
  const artworkKey=JSON.stringify([file.id,ui.current,file.crops.get(ui.current)||null,file.title]);
  if(viewer.open&&oldMode==='false'&&!cropping&&viewer.querySelector('.viewer-pager')){
    viewer.querySelector('.viewer-heading h2').textContent=file.title;
    viewer.querySelector('.viewer-heading p').textContent=`${courseOf(file).name} · 第 ${ui.current} / ${file.pages} 页`;
    if(viewer.dataset.artworkKey!==artworkKey){
      const surface=viewer.querySelector('.page-surface');
      if(WorkbenchBusiness.enabled)ReviewMedia.viewer(surface,file,ui.current,false);
      else surface.innerHTML=slideSvg(file,ui.current);
    }
    viewer.querySelector('.viewer-pager span').textContent=`${ui.current} / ${file.pages}`;
    viewer.querySelector('[data-action="previous"]').disabled=stepTarget(-1)===null;
    viewer.querySelector('[data-action="next"]').disabled=stepTarget(1)===null;
    const exclude=viewer.querySelector('.viewer-footer > [data-action="exclude"]'),excluded=file.excluded.has(ui.current);
    exclude.innerHTML=icon(excluded?'refresh':'minus')+(excluded?'恢复此页':'排除此页');
    const tools=viewer.querySelector('.crop-controls'),hasCrop=String(file.crops.has(ui.current));
    if(tools.dataset.cropped!==hasCrop){
      tools.innerHTML=button('裁剪画面','crop','crop','button')+(file.crops.has(ui.current)?button('还原裁剪','reset-crop','undo','button'):'');
      tools.dataset.cropped=hasCrop;
    }
    viewer.dataset.artworkKey=artworkKey;
    fitViewer();WorkbenchMotion.restoreFocus(viewer,focus,'crop');return;
  }
  canvasObserver?.disconnect();
  viewer.innerHTML=`<div class="viewer-heading"><div><h2>${escapeHtml(file.title)}</h2><p>${escapeHtml(courseOf(file).name)} · 第 ${ui.current} / ${file.pages} 页</p></div>
      <span class="spacer"></span><span class="viewer-hint">${cropping?'<kbd>方向键</kbd> 微调选区　<kbd>Enter</kbd> 确认':`<kbd>←</kbd> <kbd>→</kbd> 翻页　<kbd>E</kbd> 排除 / 恢复`}</span>${iconButton('close','关闭放大视图','close-viewer')}</div>
    <div class="viewer-stage"><div class="page-surface">${WorkbenchBusiness.enabled?ReviewMedia.canvas():slideSvg(file,ui.current,!cropping)}${cropping?`<div class="crop-overlay" id="crop-overlay"><div class="crop-region" style="left:${ui.crop.x*100}%;top:${ui.crop.y*100}%;width:${ui.crop.w*100}%;height:${ui.crop.h*100}%">${['nw','n','ne','e','se','s','sw','w'].map(handle=>`<i class="crop-handle ${handle}" data-crop-handle="${handle}"></i>`).join('')}</div></div>`:''}</div></div>
    <div class="viewer-footer ${cropping?'cropping':''}"><div class="crop-controls">
      ${button(cropping?'完成裁剪':'裁剪画面','crop','crop',cropping?'primary':'button')}
      ${cropping?button('取消','cancel-crop')+button('还原','reset-crop','undo','button')+button('应用到全部页','crop-all','','button')+button(`应用到选中 ${reviewUi.selected.size} 页`,'crop-selected','','button',reviewUi.selected.size?'':'disabled'):file.crops.has(ui.current)?button('还原裁剪','reset-crop','undo','button'):''}</div>
      ${cropping?`<span class="crop-readout">保留 ${Math.round(ui.crop.w*100)}% × ${Math.round(ui.crop.h*100)}%</span>`:`<div class="viewer-pager">${button('上一页','previous','left','button',stepTarget(-1)===null?'disabled':'')}<span>${ui.current} / ${file.pages}</span>${button('下一页','next','right','button',stepTarget(1)===null?'disabled':'')}</div>${button(file.excluded.has(ui.current)?'恢复此页':'排除此页','exclude',file.excluded.has(ui.current)?'refresh':'minus','button')}`}</div>`;
  viewer.dataset.cropping=String(cropping);viewer.dataset.artworkKey=artworkKey;
  if(WorkbenchBusiness.enabled)ReviewMedia.viewer(viewer.querySelector('.page-surface'),file,ui.current,cropping);
  viewer.querySelector('.crop-controls').dataset.cropped=String(file.crops.has(ui.current));
  if(viewer.open&&oldMode!==String(cropping)){
    WorkbenchMotion.play(viewer.querySelector('.viewer-footer'),[{opacity:.7},{opacity:1}],140);
    if(cropping)WorkbenchMotion.play(viewer.querySelector('.crop-overlay'),[{opacity:0},{opacity:1}],140);
    WorkbenchMotion.restoreFocus(viewer,focus,'crop');
  }
  requestAnimationFrame(fitViewer);
  attachCrop();
}
function fitViewer() {
  const stage=document.querySelector('.viewer-stage'),surface=stage?.querySelector('.page-surface');
  if(!stage||!surface||!viewerOpen())return;
  const fit=()=>{
    const style=getComputedStyle(stage),bitmap=surface.querySelector('canvas.slide'),box=bitmap?{width:bitmap.width,height:bitmap.height}:surface.querySelector('svg').viewBox.baseVal;
    const width=stage.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight);
    const height=stage.clientHeight-parseFloat(style.paddingTop)-parseFloat(style.paddingBottom);
    surface.style.width=Math.max(50,Math.min(width,height*box.width/box.height))+'px';
  };
  fit();canvasObserver?.disconnect();canvasObserver=new ResizeObserver(fit);canvasObserver.observe(stage);
}
function fullCrop(rect) {return rect.x<.0005&&rect.y<.0005&&rect.w>.9995&&rect.h>.9995;}
function cropEqual(a,b) {return ['x','y','w','h'].every(key=>Math.abs(a[key]-b[key])<.0005);}
function cropAction() {
  const file=currentFile();
  if(WorkbenchBusiness.enabled&&(WorkbenchBusiness.busy||WorkbenchBusiness.missing(file,ui.current)))return notify('当前页面无法裁剪，或上次修改仍在保存。');
  if(WorkbenchBusiness.enabled&&!WorkbenchBusiness.canCrop(file))return notify('页面正在加载，请稍候再裁剪。');
  if(!ui.crop){ui.crop={...(file.crops.get(ui.current)||{x:0,y:0,w:1,h:1})};showViewer();return;}
  applyCropToPages([ui.current],true);
}
function applyCropToPages(pages,finish=false) {
  if(!ui.crop||!pages.length)return;
  const rect={...ui.crop}, file=currentFile(), full={x:0,y:0,w:1,h:1};
  const changed=pages.filter(page=>!cropEqual(file.crops.get(page)||full,rect)&&(!WorkbenchBusiness.enabled||!WorkbenchBusiness.missing(file,page)));
  if(WorkbenchBusiness.enabled){
    if(!changed.length){if(finish)ui.crop=null;refreshReview();return;}
    const crops=new Map(file.crops);changed.forEach(page=>fullCrop(rect)?crops.delete(page):crops.set(page,{...rect}));
    return WorkbenchBusiness.commit(file,file.excluded,crops,{finish});
  }
  if(changed.length){recordChange();changed.forEach(page=>fullCrop(rect)?file.crops.delete(page):file.crops.set(page,{...rect}));}
  if(finish)ui.crop=null;
  refreshReview();
  if(changed.length)notify(`已更新 ${changed.length} 页的裁剪，原始画面保留。`,'success');
}
function resetCrop() {
  if(ui.crop){ui.crop={x:0,y:0,w:1,h:1};renderViewer();return;}
  if(!currentFile().crops.has(ui.current))return;
  if(WorkbenchBusiness.enabled){const crops=new Map(currentFile().crops);crops.delete(ui.current);return WorkbenchBusiness.commit(currentFile(),currentFile().excluded,crops);}
  recordChange();currentFile().crops.delete(ui.current);refreshReview();
}
function updateCropRegion() {
  const region=document.querySelector('#crop-overlay .crop-region');if(!region||!ui.crop)return;
  Object.assign(region.style,{left:ui.crop.x*100+'%',top:ui.crop.y*100+'%',width:ui.crop.w*100+'%',height:ui.crop.h*100+'%'});
  document.querySelector('.crop-readout').textContent=`保留 ${Math.round(ui.crop.w*100)}% × ${Math.round(ui.crop.h*100)}%`;
}
function attachCrop() {
  const overlay=document.querySelector('#crop-overlay');if(!overlay)return;
  overlay.addEventListener('pointerdown',event=>{
    if(event.button!==0)return;
    WorkbenchMotion.settle(document.querySelector('#viewer'));
    const bounds=overlay.getBoundingClientRect(),start={...ui.crop},sx=(event.clientX-bounds.left)/bounds.width,sy=(event.clientY-bounds.top)/bounds.height;
    const handle=event.target.closest('[data-crop-handle]')?.dataset.cropHandle;
    const moving=!handle&&!fullCrop(start)&&!!event.target.closest('.crop-region');
    overlay.setPointerCapture(event.pointerId);event.preventDefault();
    const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
    const move=event=>{
      const x=clamp((event.clientX-bounds.left)/bounds.width,0,1),y=clamp((event.clientY-bounds.top)/bounds.height,0,1);
      if(moving)ui.crop={...start,x:clamp(start.x+x-sx,0,1-start.w),y:clamp(start.y+y-sy,0,1-start.h)};
      else if(handle){
        let left=start.x,top=start.y,right=start.x+start.w,bottom=start.y+start.h;
        if(handle.includes('w'))left=clamp(start.x+x-sx,0,right-.025);
        if(handle.includes('e'))right=clamp(start.x+start.w+x-sx,left+.025,1);
        if(handle.includes('n'))top=clamp(start.y+y-sy,0,bottom-.025);
        if(handle.includes('s'))bottom=clamp(start.y+start.h+y-sy,top+.025,1);
        ui.crop={x:left,y:top,w:right-left,h:bottom-top};
      }else{
        const left=Math.min(sx,x,.975),top=Math.min(sy,y,.975);
        ui.crop={x:left,y:top,w:Math.min(1-left,Math.max(.025,Math.abs(x-sx))),h:Math.min(1-top,Math.max(.025,Math.abs(y-sy)))};
      }
      updateCropRegion();
    };
    const end=()=>{overlay.removeEventListener('pointermove',move);overlay.removeEventListener('pointerup',end);overlay.removeEventListener('pointercancel',end);};
    overlay.addEventListener('pointermove',move);overlay.addEventListener('pointerup',end);overlay.addEventListener('pointercancel',end);
  });
}
function handleReviewKey(event) {
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){event.preventDefault();undo();return;}
  if(event.ctrlKey||event.metaKey||event.altKey)return;
  if(event.key==='Escape'&&!ui.crop&&viewerOpen()){event.preventDefault();closeViewer();return;}
  if(event.key==='Enter'&&event.target.matches('[data-preview]')){event.preventDefault();selectPage(Number(event.target.dataset.preview));showViewer();return;}
  if(ui.crop){
    const movement={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[event.key];
    if(movement){event.preventDefault();const amount=event.shiftKey?10:1;ui.crop.x=Math.max(0,Math.min(1-ui.crop.w,ui.crop.x+movement[0]*amount/960));ui.crop.y=Math.max(0,Math.min(1-ui.crop.h,ui.crop.y+movement[1]*amount/540));updateCropRegion();}
    if(event.key==='Enter'){event.preventDefault();cropAction();}
    if(event.key==='Escape'){event.preventDefault();ui.crop=null;renderViewer();}
    return;
  }
  if(event.key==='ArrowRight'){event.preventDefault();stepPage(1);}
  if(event.key==='ArrowLeft'){event.preventDefault();stepPage(-1);}
  if(event.key.toLowerCase()==='e'){event.preventDefault();setExcluded(!currentFile().excluded.has(ui.current));}
  if(event.key.toLowerCase()==='c'){event.preventDefault();cropAction();}
}
