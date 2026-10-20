'use strict';

// 放大浮层与裁剪模式：整页查看、非破坏性裁剪的交互与取景，以及浮层的控件同步。


let fullscreenFrame=null;
let cropGesture=null;
let cropSavedAt=false;
let cropSavedTimer=null;
let cropNudgeTimer=null;
function scheduleFullscreen(){
  if(fullscreenFrame!==null)return;
  fullscreenFrame=requestAnimationFrame(()=>{fullscreenFrame=null;if(modal.open&&modal.classList.contains('fullscreen-modal'))showFullscreen();});
}
function showFullscreen(){
  const m=material();
  const updating=modal.open&&modal.classList.contains('fullscreen-modal')&&$('#fullscreen-stage');
  if(updating){
    $('#fullscreen-title').textContent=`${m.title} · 第 ${view.currentPage} 页`;
  }else{
    modal.classList.add('fullscreen-modal');
    $('#modal-content').innerHTML=`<div class="modal-header"><h2 id="fullscreen-title">${esc(m.title)} · 第 ${view.currentPage} 页</h2><div class="fullscreen-shortcuts" id="fullscreen-shortcuts" data-signature="${view.crop?1:0}">${fullscreenShortcutsHtml()}</div><button class="icon-button" data-action="close-modal" aria-label="关闭">${icon('close')}</button></div><div class="modal-body"><div id="fullscreen-stage">${stageHtml(m)}</div><div class="full-nav${view.crop?' cropping':''}" data-signature="">${fullNavHtml(m)}</div></div>`;
    modal.showModal();
    if(view.crop)fillCropLayer();
  }
  updateSlideSource($('#fullscreen-stage'),m,view.currentPage,!!view.crop,layoutCropLayer);
  syncFullscreenChrome();
  requestAnimationFrame(layoutCropLayer);
  preloadSlides(m,[view.currentPage+1,view.currentPage-1,view.currentPage+2,view.currentPage-2]);
}
function stageHtml(m){
  const surface='<canvas class="slide preview-canvas"></canvas>';
  return view.crop?`${surface}<div class="crop-layer" id="crop-layer"></div>`:surface;
}
function cropFrame(m){const crop=cropOf(m,view.currentPage);return crop?{page:view.currentPage,x:crop[0],y:crop[1],w:crop[2],h:crop[3]}:{page:view.currentPage,...fullCrop()};}
function cropFrameChanged(){
  const crop=view.crop;if(!crop)return false;
  return crop.x>0.001||crop.y>0.001||crop.w<0.999||crop.h<0.999;
}
const isFullCrop=rect=>!!rect&&rect[0]<=0.0005&&rect[1]<=0.0005&&rect[2]>=0.9995&&rect[3]>=0.9995;
// 浏览态只留浏览该有的动作；进入裁剪模式后一次给全，位置不再变动。
function cropToolsHtml(m){
  if(missingPage(m,view.currentPage))return '<span>此页缺失，无法裁剪</span>';
  const crop=cropOf(m,view.currentPage),cropping=!!view.crop,actionable=cropping?(cropFrameChanged()||!!crop):!!crop,parts=[];
  parts.push(`<button data-action="crop-toggle" class="${cropping?'primary':''}">${icon('crop')}${cropping?'完成裁剪':'裁剪'}</button>`);
  if(cropping){
    parts.push(`<button data-action="crop-reset" ${actionable?'':'disabled'}>还原裁剪</button>`);
    parts.push(`<button data-action="crop-all" ${actionable?'':'disabled'} title="把当前页的裁剪应用到本课所有页">应用到全部页</button>`);
    parts.push(`<button data-action="crop-selected" ${actionable&&view.selected.size?'':'disabled'}>应用到选中 ${view.selected.size} 页</button>`);
    parts.push('<span class="crop-readout" id="crop-readout"></span>');
  }else if(crop){
    parts.push('<button data-action="crop-reset">还原裁剪</button>');
  }
  return parts.join('');
}
function fullNavHtml(m){
  const tools=`<div class="nav-crop" id="fullscreen-crop-tools">${cropToolsHtml(m)}</div>`;
  if(view.crop)return tools; // 裁剪模式：整行只属于裁剪，翻页与排除退出舞台
  return `${tools}<div class="nav-pager"><button data-action="previous" ${stepTarget(-1)===null?'disabled':''}>${icon('left')}上一页</button><span id="fullscreen-page">${view.currentPage} / ${m.pages}</span><button data-action="next" ${stepTarget(1)===null?'disabled':''}>下一页${icon('right')}</button></div><button class="nav-exclude" data-action="toggle-fullscreen-page">${m.excluded.includes(view.currentPage)?'恢复此页':'排除此页'}</button>`;
}
function fullscreenShortcutsHtml(){
  const hint='<span id="fullscreen-nav-hint"></span>';
  return view.crop?hint:`${hint}<span><kbd>E</kbd> 排除 / 恢复</span><span><kbd>C</kbd> 裁剪</span>`;
}
function syncFullscreenChrome(){
  const m=material();if(!m)return;
  if(view.crop&&view.crop.page!==view.currentPage&&!cropGesture)view.crop=cropFrame(m);
  const shortcuts=$('#fullscreen-shortcuts');
  if(shortcuts){
    const mode=view.crop?1:0;
    if(shortcuts.dataset.signature!==String(mode)){shortcuts.dataset.signature=String(mode);shortcuts.innerHTML=fullscreenShortcutsHtml();}
  }
  const hint=$('#fullscreen-nav-hint');
  if(hint)hint.innerHTML=view.crop?'<kbd>方向键</kbd> 微调裁剪框　<kbd>Enter</kbd> 完成':`<kbd>←</kbd> <kbd>→</kbd> 翻页${view.pageFilter==='kept'?'（跳过已排除页）':''}`;
  const nav=$('.full-nav');
  if(nav){
    // 翻页只修改现有控件，避免重建按钮打断鼠标点击或丢失焦点。
    const mode=String(!!view.crop);
    if(nav.dataset.signature!==mode){nav.dataset.signature=mode;nav.classList.toggle('cropping',!!view.crop);nav.innerHTML=fullNavHtml(m);}
    const tools=nav.querySelector('#fullscreen-crop-tools');
    const signature=[view.crop?view.selected.size:0,cropOf(m,view.currentPage)?1:0,cropFrameChanged()?1:0,missingPage(m,view.currentPage)?1:0].join('|');
    if(tools&&tools.dataset.signature!==signature){tools.dataset.signature=signature;tools.innerHTML=cropToolsHtml(m);}
    const previous=nav.querySelector('[data-action="previous"]'),next=nav.querySelector('[data-action="next"]'),page=nav.querySelector('#fullscreen-page'),exclude=nav.querySelector('[data-action="toggle-fullscreen-page"]');
    if(previous)previous.disabled=stepTarget(-1)===null;
    if(next)next.disabled=stepTarget(1)===null;
    if(page)page.textContent=`${view.currentPage} / ${m.pages}`;
    if(exclude){exclude.textContent=missingPage(m,view.currentPage)?'此页缺失':m.excluded.includes(view.currentPage)?'恢复此页':'排除此页';exclude.disabled=!!missingPage(m,view.currentPage);}
  }
  updateCropReadout();layoutCropLayer();
}
function toggleCropMode(){
  if(view.crop)return exitCropMode();
  const m=material();if(!m)return;
  if(missingPage(m,view.currentPage))return toast('平台未提供此页，无法裁剪。');
  view.crop=cropFrame(m);rebuildFullscreenStage();syncFullscreenChrome();
}
function exitCropMode(){view.crop=null;rebuildFullscreenStage();syncFullscreenChrome();}
function rebuildFullscreenStage(){
  const m=material(),stage=$('#fullscreen-stage');if(!m||!stage)return;
  stage.innerHTML=stageHtml(m);
  if(view.crop)fillCropLayer();
  updateSlideSource(stage,m,view.currentPage,!!view.crop,layoutCropLayer);
  applyCropViews();
  requestAnimationFrame(layoutCropLayer);
}
function fillCropLayer(){
  const layer=$('#crop-layer');if(!layer)return;
  layer.innerHTML=`<div class="crop-box" id="crop-box">${['nw','n','ne','e','se','s','sw','w'].map(handle=>`<i class="crop-handle" data-handle="${handle}"></i>`).join('')}</div>`;
  paintCropBox();
}
function paintCropBox(){
  const box=$('#crop-box');if(!box||!view.crop)return;
  const {x,y,w,h}=view.crop;
  box.style.left=`${x*100}%`;box.style.top=`${y*100}%`;box.style.width=`${w*100}%`;box.style.height=`${h*100}%`;
}
function layoutCropLayer(){
  const stage=$('#fullscreen-stage'),image=stage?.querySelector('.slide'),layer=stage?.querySelector('.crop-layer');
  if(!stage||!image||!layer)return;
  const bitmap=pageBitmapRect(image);
  if(!bitmap){layer.style.display='none';return;}
  const box=stage.getBoundingClientRect();
  layer.style.display='block';
  layer.style.left=`${bitmap.left-box.left}px`;layer.style.top=`${bitmap.top-box.top}px`;
  layer.style.width=`${bitmap.width}px`;layer.style.height=`${bitmap.height}px`;
  paintCropBox();
}
function ratioLabel(width,height){
  if(!width||!height)return'';
  const gcd=(a,b)=>b?gcd(b,a%b):a;
  const divisor=gcd(Math.round(width),Math.round(height));
  const left=Math.round(width)/divisor,right=Math.round(height)/divisor;
  return left<=60&&right<=60?`${left}:${right}`:`${(width/height).toFixed(2)}:1`;
}
function updateCropReadout(){
  const readout=$('#crop-readout');if(!readout)return;
  if(!view.crop){readout.textContent=cropOf(material(),view.currentPage)?'此页已裁剪 · 导出使用裁剪后的画面':'';return;}
  const image=$('#fullscreen-stage .slide'),iw=image?.naturalWidth||0,ih=image?.naturalHeight||0;
  const {x,y,w,h}=view.crop;
  const size=iw?` · ${Math.round(iw*w)}×${Math.round(ih*h)} ${ratioLabel(iw*w,ih*h)}`:'';
  readout.textContent=`裁剪范围 ${Math.round(w*100)}% × ${Math.round(h*100)}%${size}${cropSavedAt?' · 已保存':''}`;
}
function flashCropSaved(){
  if(!view.crop)return;
  cropSavedAt=true;updateCropReadout();
  clearTimeout(cropSavedTimer);cropSavedTimer=setTimeout(()=>{cropSavedAt=false;updateCropReadout();},1400);
}
function cropRectValue(){const crop=view.crop;return crop?[round6(crop.x),round6(crop.y),round6(crop.w),round6(crop.h)]:null;}
// 拉满整页等于没有裁剪，避免存下一份没有意义的整页矩形。
function commitCropFrame(message){const rect=cropRectValue();return applyCrop(isFullCrop(rect)?null:rect,message||'');}
function toNorm(event,layer){const box=layer.getBoundingClientRect();return {x:(event.clientX-box.left)/box.width,y:(event.clientY-box.top)/box.height};}
function clampCrop(rect,layer,snap=true){
  const box=layer.getBoundingClientRect(),minWidth=20/box.width,minHeight=20/box.height,snapX=8/box.width,snapY=8/box.height;
  let {x,y,w,h}=rect;
  w=Math.max(minWidth,Math.min(1,w));h=Math.max(minHeight,Math.min(1,h));
  x=Math.max(0,Math.min(1-w,x));y=Math.max(0,Math.min(1-h,y));
  if(snap){ // 键盘微调不做吸附，保证每次按键都真的动 1px
    if(x<snapX)x=0;else if(x+w>1-snapX)w=1-x;
    if(y<snapY)y=0;else if(y+h>1-snapY)h=1-y;
  }
  return {x,y,w,h};
}
function resizeCrop(origin,handle,point){
  let {x,y,w,h}=origin;const right=x+w,bottom=y+h;
  if(handle.includes('w')){x=Math.min(point.x,right);w=right-x;}
  if(handle.includes('e')){w=Math.max(point.x,x)-x;}
  if(handle.includes('n')){y=Math.min(point.y,bottom);h=bottom-y;}
  if(handle.includes('s')){h=Math.max(point.y,y)-y;}
  return {x,y,w,h};
}
async function resetCrop(){
  const m=material();
  if(view.crop){view.crop={page:view.currentPage,...fullCrop()};paintCropBox();updateCropReadout();layoutCropLayer();}
  const crops={...cropsOf(m)};delete crops[String(view.currentPage)];
  await commitCrop(crops,cropOf(m,view.currentPage)?'已还原为整页':'');
}
async function applyCropToAll(){
  const m=material(),rect=cropOf(m,view.currentPage);
  if(!rect)return toast('请先裁剪当前页，再应用到其他页。');
  const crops={...cropsOf(m)};
  for(let page=1;page<=m.pages;page++)crops[String(page)]=rect;
  await commitCrop(crops,`已将当前裁剪应用到全部 ${m.pages} 页`);
}
async function applyCropToSelected(){
  const m=material(),rect=cropOf(m,view.currentPage),pages=[...view.selected].sort((a,b)=>a-b);
  if(!rect)return toast('请先裁剪当前页，再应用到选中的页面。');
  if(!pages.length)return toast('请先在网格里勾选页面。');
  const crops={...cropsOf(m)};
  pages.forEach(page=>crops[String(page)]=rect);
  await commitCrop(crops,`已将当前裁剪应用到选中的 ${pages.length} 页`);
}
document.addEventListener('pointerdown',event=>{
  const layer=event.target.closest?.('#crop-layer');
  if(!layer||!view.crop||view.saving||event.button!==0)return;
  const point=toNorm(event,layer),crop=view.crop;
  const inside=point.x>=crop.x&&point.x<=crop.x+crop.w&&point.y>=crop.y&&point.y<=crop.y+crop.h;
  const handle=event.target.dataset?.handle||'';
  cropGesture={mode:handle?'resize':inside?'move':'new',handle,start:point,origin:{x:crop.x,y:crop.y,w:crop.w,h:crop.h},moved:false};
  try{layer.setPointerCapture(event.pointerId);}catch{}
  event.preventDefault();
});
document.addEventListener('pointermove',event=>{
  const layer=$('#crop-layer');
  if(!cropGesture||!layer||!view.crop)return;
  const point=toNorm(event,layer),gesture=cropGesture;
  let next;
  if(gesture.mode==='new'){const x=Math.min(gesture.start.x,point.x),y=Math.min(gesture.start.y,point.y);next={x,y,w:Math.abs(point.x-gesture.start.x),h:Math.abs(point.y-gesture.start.y)};}
  else if(gesture.mode==='move')next={x:gesture.origin.x+(point.x-gesture.start.x),y:gesture.origin.y+(point.y-gesture.start.y),w:gesture.origin.w,h:gesture.origin.h};
  else next=resizeCrop(gesture.origin,gesture.handle,point);
  gesture.raw=next;gesture.moved=true;
  view.crop={page:view.currentPage,...clampCrop(next,layer)};
  paintCropBox();updateCropReadout();
});
document.addEventListener('pointerup',()=>{
  const gesture=cropGesture;if(!gesture)return;
  cropGesture=null;
  const layer=$('#crop-layer');if(!layer||!view.crop)return;
  const box=layer.getBoundingClientRect(),raw=gesture.raw;
  if(!gesture.moved||(gesture.mode==='new'&&(!raw||raw.w*box.width<8||raw.h*box.height<8))){
    view.crop={page:view.currentPage,...gesture.origin};paintCropBox();updateCropReadout();return;
  }
  commitCropFrame().catch(fail);
});
document.addEventListener('load',event=>{const image=event.target;if(image?.matches?.('img.slide')){applyCropViews(image.parentElement);if(image.closest('#fullscreen-stage'))layoutCropLayer();}},true);
window.addEventListener('resize',()=>{applyCropViews();layoutCropLayer();});


// —— 裁剪相关动作注册（只在浮层里出现） ——
registerActions({
  'crop-toggle':()=>toggleCropMode(),
  'crop-reset':()=>resetCrop(),
  'crop-all':()=>applyCropToAll(),
  'crop-selected':()=>applyCropToSelected(),
});
