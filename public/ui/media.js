'use strict';

// 页面图像的呈现：缩略图/大图标记，以及非破坏性裁剪的显示换算。

function slide(m,page=1,thumb=false,raw=false){
  const missing=missingPage(m,page);
  if(missing)return `<div class="slide-missing" role="note"><strong>原始第 ${page} 页缺失</strong><span>${esc(missing.reason)}</span><span>其余页面可正常整理和导出</span></div>`;
  const media=m.media?.[page-1];
  if(!media)return '<div class="empty">页面预览暂不可用</div>';
  const crop=raw?null:cropOf(m,page);
  return `<img class="slide" ${thumb?'loading="lazy"':''} decoding="async" ${crop?`data-crop="${crop.join(',')}"`:''} src="${esc(thumb?media.thumb:media.src)}" alt="${esc(m.title)} · 第 ${page} 页">`;
}
// Keep decoded image objects instead of repeatedly changing one visible <img>.
// The canvas retains its last frame until the requested page is ready to paint.
const slideRequests=new WeakMap();
const slideCache=new Map();
const slideCacheBudget=64*1024*1024;
function trimSlideCache(){
  let bytes=0;for(const item of slideCache.values())bytes+=item.bytes||0;
  for(const [key,item] of slideCache){if(bytes<=slideCacheBudget)break;if(item.image){slideCache.delete(key);bytes-=item.bytes;}}
}
function loadSlideImage(src){
  const existing=slideCache.get(src);
  if(existing){slideCache.delete(src);slideCache.set(src,existing);return existing.promise;}
  const entry={image:null,bytes:0};
  entry.promise=new Promise((resolve,reject)=>{
    let attempt=0,image,timer,settled=false;
    const cleanup=()=>{clearTimeout(timer);if(image){image.onload=null;image.onerror=null;}};
    const fail=()=>{
      cleanup();image.src='';
      if(++attempt<2){start();return;}
      settled=true;if(slideCache.get(src)===entry)slideCache.delete(src);
      reject(new Error('页面图片读取失败，请点击重试。'));
    };
    const start=()=>{
      image=new Image();image.decoding='sync';
      image.onload=()=>{
        if(settled)return;
        if(!image.naturalWidth){fail();return;}
        settled=true;cleanup();entry.image=image;entry.bytes=image.naturalWidth*image.naturalHeight*4;
        resolve(image);trimSlideCache();
      };
      image.onerror=fail;
      timer=setTimeout(fail,4000);
      image.src=attempt?src+(src.includes('?')?'&':'?')+'retry='+Date.now():src;
    };
    start();
  });
  slideCache.set(src,entry);return entry.promise;
}
function preloadSlides(m,pages){
  // Only one speculative request at a time; a foreground request reuses it.
  const sources=pages.map(p=>m.media?.[p-1]?.src).filter(Boolean);
  const ticket=++preloadSlides.ticket;
  (async()=>{for(const src of sources){if(ticket!==preloadSlides.ticket)return;try{await loadSlideImage(src);}catch{}}})();
}
preloadSlides.ticket=0;
function updateSlideSource(stage,m,page,raw=false,onReady=()=>{}){
  if(!stage)return;
  const src=m.media?.[page-1]?.src;if(!src)return;
  let previous=slideRequests.get(stage);
  if(previous?.src===src&&previous.canvas.isConnected){
    previous.material=m;previous.raw=raw;previous.onReady=onReady;
    if(previous.image)previous.paint();return;
  }
  let canvas=stage.querySelector('canvas.slide');
  if(!canvas){
    canvas=document.createElement('canvas');canvas.className='slide preview-canvas';
    canvas.setAttribute('role','img');
    const old=stage.querySelector('img.slide');if(old)old.replaceWith(canvas);else stage.prepend(canvas);
  }
  let status=stage.querySelector('[data-slide-status]');
  if(!status){status=document.createElement('button');status.type='button';status.dataset.slideStatus='';status.className='slide-load-status';stage.append(status);}
  const request={src,canvas,material:m,raw,onReady,image:null};
  const current=()=>slideRequests.get(stage)===request&&canvas.isConnected;
  request.paint=()=>{
    if(!current()||!request.image)return;
    const image=request.image,crop=request.raw?null:cropOf(request.material,page);
    const [x,y,w,h]=crop||[0,0,1,1],iw=image.naturalWidth,ih=image.naturalHeight;
    // One synchronous commit; there is no empty intermediate DOM image frame.
    canvas.width=Math.max(1,Math.round(iw*w));canvas.height=Math.max(1,Math.round(ih*h));
    canvas.getContext('2d',{alpha:false}).drawImage(image,x*iw,y*ih,w*iw,h*ih,0,0,canvas.width,canvas.height);
    canvas.naturalWidth=iw;canvas.naturalHeight=ih;canvas.dataset.page=String(page);
    canvas.setAttribute('aria-label',`${request.material.title} · 第 ${page} 页`);
    status.hidden=true;stage.removeAttribute('aria-busy');stage.classList.remove('slide-loading','slide-error');request.onReady();
  };
  slideRequests.set(stage,request);
  stage.setAttribute('aria-busy','true');stage.classList.remove('slide-loading','slide-error');
  status.hidden=false;status.disabled=true;status.textContent=`正在加载第 ${page} 页…`;status.onclick=null;
  const ready=slideCache.get(src)?.image;
  if(ready){request.image=ready;request.paint();return;}
  loadSlideImage(src).then(image=>{request.image=image;request.paint();}).catch(()=>{
    if(!current())return;
    stage.removeAttribute('aria-busy');status.hidden=false;status.disabled=false;status.textContent=`第 ${page} 页读取失败，点击重试`;
    status.onclick=()=>{if(!current())return;slideRequests.delete(stage);updateSlideSource(stage,request.material,page,request.raw,request.onReady);};
  });
}
// 勾选状态只改动相关 DOM：不重建网格，避免已裁切的缩略图闪回未裁剪的样子。
function syncImageCrop(image,m,page,raw=false){
  if(!image)return;
  const crop=raw?null:cropOf(m,page);
  if(crop)image.dataset.crop=crop.join(',');else delete image.dataset.crop;
  delete image.dataset.cropReady; // 裁剪样式重算前保持隐藏，避免闪出未裁剪的样子
  image.style.transform='';image.style.clipPath='';
}
function pageBitmapRect(image){const rect=image.getBoundingClientRect(),iw=image.naturalWidth,ih=image.naturalHeight;if(!iw||!ih||!rect.width||!rect.height)return null;const scale=Math.min(rect.width/iw,rect.height/ih),width=iw*scale,height=ih*scale;return {left:rect.left+(rect.width-width)/2,top:rect.top+(rect.height-height)/2,width,height};}
const cropLoadPending=new WeakSet();
function applyCropViews(root=document){
  const pending=[];
  for(const image of root.querySelectorAll('img.slide[data-crop]')){
    const parts=(image.dataset.crop||'').split(',').map(Number);
    if(parts.length!==4||parts.some(value=>!Number.isFinite(value)))continue;
    if(!image.complete||!image.naturalWidth){ // 还没解码：保持隐藏，解码完成后再补样式
      if(!cropLoadPending.has(image)){
        cropLoadPending.add(image);
        const cleanup=()=>{cropLoadPending.delete(image);image.removeEventListener('load',loaded);image.removeEventListener('error',failed);};
        const loaded=()=>{cleanup();if(image.isConnected)applyCropViews(image.parentElement||root);};
        const failed=()=>{cleanup();image.dataset.cropReady='1';};
        image.addEventListener('load',loaded);image.addEventListener('error',failed);
      }
      continue;
    }
    pending.push([image,parts]);
  }
  if(!pending.length)return;
  for(const [image] of pending){image.style.transform='';image.style.clipPath='';} // 批量复位，否则量到的是上一次变换后的外框
  const boxes=pending.map(([image])=>image.getBoundingClientRect());               // 批量测量：整个循环只触发一次布局
  pending.forEach(([image,parts],index)=>{
    const box=boxes[index],iw=image.naturalWidth,ih=image.naturalHeight;
    if(!box.width||!box.height)return;
    const [cx,cy,cw,ch]=parts;
    const base=Math.min(box.width/iw,box.height/ih);
    const bitmapWidth=iw*base,bitmapHeight=ih*base,bitmapLeft=(box.width-bitmapWidth)/2,bitmapTop=(box.height-bitmapHeight)/2;
    const cropLeft=bitmapLeft+cx*bitmapWidth,cropTop=bitmapTop+cy*bitmapHeight,cropWidth=cw*bitmapWidth,cropHeight=ch*bitmapHeight;
    const fitted=Math.min(box.width/(iw*cw),box.height/(ih*ch));
    const scale=fitted/base,targetWidth=iw*cw*fitted,targetHeight=ih*ch*fitted;
    const targetLeft=(box.width-targetWidth)/2,targetTop=(box.height-targetHeight)/2;
    image.style.transformOrigin='0 0';
    image.style.transform=`translate(${(targetLeft-scale*cropLeft).toFixed(2)}px,${(targetTop-scale*cropTop).toFixed(2)}px) scale(${scale.toFixed(4)})`;
    image.style.clipPath=`inset(${cropTop.toFixed(2)}px ${(box.width-cropLeft-cropWidth).toFixed(2)}px ${(box.height-cropTop-cropHeight).toFixed(2)}px ${cropLeft.toFixed(2)}px)`;
    image.dataset.cropReady='1';
  });
}
