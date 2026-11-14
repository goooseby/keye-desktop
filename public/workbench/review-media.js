'use strict';

const ReviewMedia = (() => {
  let observer=null,retained=null;
  const canvas=()=>'<canvas class="slide preview-canvas" width="1" height="1" role="img"></canvas>';
  function paint(stage,file,page,{thumb=false,raw=false,onReady}={}){
    if(!stage)return;
    const media=file.media?.[page-1];
    if(!media||WorkbenchBusiness.missing(file,page)){
      KeyePageImages.cancel(stage);stage.innerHTML=WorkbenchBusiness.artwork(file,page,false);return;
    }
    KeyePageImages.draw(stage,{src:thumb?media.thumb:media.src,page,alt:`${file.title} · 第 ${page} 页`,
      crop:()=>{const r=!raw&&file.crops.get(page);return r?[r.x,r.y,r.w,r.h]:null;},
      onReady:(bitmap,image)=>{
        stage.querySelectorAll('svg').forEach(svg=>svg.remove());
        onReady?.(bitmap,image);
      }});
  }
  function capture(grid){
    if(!grid)return;
    const box=grid.getBoundingClientRect(),canvases=new Map();
    for(const item of grid.querySelectorAll('[data-page-tile]')){
      const bitmap=item.querySelector('canvas.slide'),r=item.getBoundingClientRect();
      if(bitmap?.width>1&&r.bottom>box.top-300&&r.top<box.bottom+300&&canvases.size<36)canvases.set(Number(item.dataset.pageTile),bitmap);
    }
    retained={fileId:grid.dataset.fileId,canvases};
  }
  function hydrate(grid,file){
    observer?.disconnect();
    observer=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting&&grid.isConnected&&grid.contains(entry.target)){
      observer.unobserve(entry.target);paint(entry.target,file,Number(entry.target.dataset.preview),{thumb:true});
    }},{root:grid,rootMargin:'300px'});
    for(const art of grid.querySelectorAll('[data-preview]')){
      const page=Number(art.dataset.preview),old=retained?.fileId===file.id&&retained.canvases.get(page);
      if(old)art.querySelector('canvas')?.replaceWith(old);
      if(KeyePageImages.peek(file.media?.[page-1]?.thumb))paint(art,file,page,{thumb:true});else observer.observe(art);
    }
    retained=null;
  }
  function preview(stage,file,page){paint(stage,file,page,{onReady:()=>KeyePageImages.preload([page+1,page-1].map(p=>file.media?.[p-1]?.src))});}
  function viewer(stage,file,page,raw){paint(stage,file,page,{raw,onReady:()=>{
    fitViewer();KeyePageImages.preload([page+1,page-1,page+2,page-2].map(p=>file.media?.[p-1]?.src));
  }});}
  return {canvas,capture,hydrate,preview,viewer,reset:()=>{observer?.disconnect();retained=null;}};
})();
