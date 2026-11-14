'use strict';

// Shared with the original UI: decoded-image LRU, one speculative request at a
// time, and one atomic canvas commit. A slow request never clears the old frame.
const KeyePageImages = (() => {
  const cache=new Map(),requests=new WeakMap();
  const budget=64*1024*1024;
  let preloadTicket=0;
  function trim(){
    let bytes=0;for(const entry of cache.values())bytes+=entry.bytes||0;
    for(const [src,entry] of cache){if(bytes<=budget)break;if(entry.image){cache.delete(src);bytes-=entry.bytes;}}
  }
  function load(src){
    const cached=cache.get(src);
    if(cached){cache.delete(src);cache.set(src,cached);return cached.promise;}
    const entry={image:null,bytes:0};
    entry.promise=new Promise((resolve,reject)=>{
      let attempt=0,image,timer,settled=false;
      const cleanup=()=>{clearTimeout(timer);if(image){image.onload=null;image.onerror=null;}};
      const fail=()=>{
        if(settled)return;cleanup();image.src='';
        if(++attempt<2){start();return;}
        settled=true;if(cache.get(src)===entry)cache.delete(src);
        reject(new Error('页面图片读取失败，请点击重试。'));
      };
      const start=()=>{
        image=new Image();image.decoding='async';
        image.onload=()=>{
          if(settled)return;if(!image.naturalWidth){fail();return;}
          cleanup();const loaded=image;
          Promise.resolve(loaded.decode?.()).then(()=>{
            if(settled||loaded!==image)return;
            settled=true;entry.image=loaded;entry.bytes=loaded.naturalWidth*loaded.naturalHeight*4;
            resolve(loaded);trim();
          },fail);
        };
        image.onerror=fail;timer=setTimeout(fail,4000);
        image.src=attempt?src+(src.includes('?')?'&':'?')+'retry='+Date.now():src;
      };
      start();
    });
    cache.set(src,entry);return entry.promise;
  }
  function peek(src){return cache.get(src)?.image||null;}
  function preload(sources){
    const ticket=++preloadTicket;
    (async()=>{for(const src of sources.filter(Boolean)){if(ticket!==preloadTicket)return;try{await load(src);}catch{}}})();
  }
  function draw(stage,options){
    if(!stage||!options.src)return;
    const previous=requests.get(stage);
    if(previous?.src===options.src&&previous.canvas.isConnected&&stage.contains(previous.canvas)){previous.options=options;if(previous.image)previous.paint();return;}
    let canvas=stage.querySelector('canvas.slide');
    if(!canvas){canvas=document.createElement('canvas');canvas.className='slide preview-canvas';canvas.width=1;canvas.height=1;canvas.setAttribute('role','img');const old=stage.querySelector('img.slide');if(old)old.replaceWith(canvas);else stage.prepend(canvas);}
    let status=stage.querySelector('[data-slide-status]');
    if(!status){status=document.createElement(stage.tagName==='BUTTON'?'span':'button');if(status.tagName==='BUTTON')status.type='button';status.dataset.slideStatus='';status.className='slide-load-status';stage.append(status);}
    const request={src:options.src,options,canvas,image:null};
    const current=()=>requests.get(stage)===request&&canvas.isConnected&&stage.contains(canvas);
    request.paint=()=>{
      if(!current()||!request.image)return;
      const image=request.image,opt=request.options,crop=typeof opt.crop==='function'?opt.crop():opt.crop;
      const [x,y,w,h]=crop||[0,0,1,1],iw=image.naturalWidth,ih=image.naturalHeight;
      const key=JSON.stringify([request.src,x,y,w,h]);
      if(canvas.dataset.paintKey!==key){
        canvas.width=Math.max(1,Math.round(iw*w));canvas.height=Math.max(1,Math.round(ih*h));
        canvas.getContext('2d',{alpha:false}).drawImage(image,x*iw,y*ih,w*iw,h*ih,0,0,canvas.width,canvas.height);
        canvas.dataset.paintKey=key;
      }
      canvas.naturalWidth=iw;canvas.naturalHeight=ih;canvas.dataset.page=String(opt.page);
      canvas.dataset.cropped=String(!!crop);canvas.setAttribute('aria-label',opt.alt||'课件页面');
      status.hidden=true;stage.removeAttribute('aria-busy');stage.classList.remove('slide-loading','slide-error');opt.onReady?.(canvas,image);
    };
    requests.set(stage,request);stage.setAttribute('aria-busy','true');
    status.hidden=false;status.disabled=true;status.textContent=`正在加载第 ${options.page} 页…`;status.onclick=null;
    const ready=peek(options.src);if(ready){request.image=ready;request.paint();return;}
    load(options.src).then(image=>{request.image=image;request.paint();}).catch(()=>{
      if(!current())return;stage.removeAttribute('aria-busy');stage.classList.add('slide-error');
      status.hidden=false;status.disabled=false;status.textContent=`第 ${options.page} 页读取失败${status.tagName==='BUTTON'?'，点击重试':''}`;
      if(status.tagName==='BUTTON')status.onclick=()=>{if(current()){requests.delete(stage);draw(stage,request.options);}};
    });
  }
  return {load,peek,preload,draw,cancel:stage=>requests.delete(stage),clear:()=>{cache.clear();preloadTicket++;},
    get stats(){return {entries:cache.size,bytes:[...cache.values()].reduce((n,e)=>n+e.bytes,0)};}};
})();
