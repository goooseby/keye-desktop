'use strict';

// 页面图像的呈现：缩略图/大图标记，以及非破坏性裁剪的显示换算。

function slide(m,page=1,thumb=false,raw=false){
  const media=m.media?.[page-1];
  if(!media)return '<div class="empty">页面预览暂不可用</div>';
  const crop=raw?null:cropOf(m,page);
  return `<img class="slide" ${thumb?'loading="lazy"':''} decoding="async" ${crop?`data-crop="${crop.join(',')}"`:''} src="${esc(thumb?media.thumb:media.src)}" alt="${esc(m.title)} · 第 ${page} 页">`;
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
function applyCropViews(root=document){
  const pending=[];
  for(const image of root.querySelectorAll('img.slide[data-crop]')){
    const parts=(image.dataset.crop||'').split(',').map(Number);
    if(parts.length!==4||parts.some(value=>!Number.isFinite(value)))continue;
    if(!image.complete||!image.naturalWidth){ // 还没解码：保持隐藏，解码完成后再补样式
      image.addEventListener('load',()=>applyCropViews(root),{once:true});
      image.addEventListener('error',()=>{image.dataset.cropReady='1';},{once:true});
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
