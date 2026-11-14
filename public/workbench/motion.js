'use strict';

// Motion belongs to UI transitions, never to the slide artwork or crop coordinates.
const WorkbenchMotion = (() => {
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const active=new WeakMap();
  const running=new Set();
  let last=null;
  let geometry=null;
  const timing={control:140,content:160,panel:210,feedback:240};
  function play(element,frames,duration=timing.content) {
    if(!element||reduced.matches||!element.animate)return;
    active.get(element)?.cancel();
    const animation=element.animate(frames,{duration,easing:'cubic-bezier(.2,.75,.25,1)'});
    active.set(element,animation);
    running.add(animation);
    const cleanup=()=>{running.delete(animation);if(active.get(element)===animation)active.delete(element);};
    animation.finished.then(cleanup,cleanup);
  }
  function enter(element,panel=false) {
    play(element,[{opacity:.7,transform:`translate${panel?'X':'Y'}(${panel?10:4}px)`},{opacity:1,transform:'none'}],panel?timing.panel:timing.content);
  }
  function emphasize(element) {
    play(element,[{boxShadow:'0 0 0 0 #4f7bc400'},{boxShadow:'0 0 0 3px #4f7bc433',offset:.35},{boxShadow:'0 0 0 0 #4f7bc400'}],timing.feedback);
  }
  function snapshot() {
    return {
      page:ui.page,tab:WorkspaceTabs.activeId,scope:ui.scope,filter:ui.filter,view:ui.view,
      compact:ui.compact,navWidth:document.querySelector('.navigation')?.getBoundingClientRect().width||0,
      details:!!document.querySelector('.list-layout > .details'),
      selected:new Set(ui.selected),pages:new Set(reviewUi.selected),
      complete:currentFile()?.review,
      tasks:new Map(ui.tasks.map(task=>[task.id,task.status])),
    };
  }
  function afterRender() {
    const before=last,now=snapshot(),previousGeometry=geometry;last=now;geometry=null;
    if(!before)return;
    if(before.compact!==now.compact){
      const frames=[{width:(previousGeometry?.navWidth||before.navWidth)+'px'},{width:now.navWidth+'px'}];
      play(document.querySelector('.navigation'),frames,timing.panel);
    }
    const routeChanged=before.tab!==now.tab||before.page!==now.page||before.scope!==now.scope;
    if(routeChanged){
      enter(document.querySelector('#page'));
      play(document.querySelector('.nav-item.active'),[{backgroundColor:'#eff2f6'},{backgroundColor:'#e5eaf0'}]);
    }
    else if(now.page==='library') {
      if(before.filter!==now.filter||before.view!==now.view)enter(document.querySelector('.table-scroll'));
      if(!before.details&&now.details)enter(document.querySelector('.list-layout > .details'),true);
      if(before.selected.size!==now.selected.size)emphasize(document.querySelector('.batch-toolbar > strong'));
    } else if(now.page==='editor') {
      for(const page of now.pages)if(!before.pages.has(page))emphasize(document.querySelector(`[data-page-tile="${page}"] .review-check`));
      if(before.complete!==now.complete)emphasize(document.querySelector('[data-action="complete"]'));
    } else if(now.page==='tasks') {
      for(const [id,status] of now.tasks)if(before.tasks.has(id)&&before.tasks.get(id)!==status){
        const row=[...document.querySelectorAll('[data-task-row]')].find(row=>row.dataset.taskRow===id);
        emphasize(row?.querySelector('.status'));
      }
    }
    if(previousGeometry?.focus&&(!routeChanged||previousGeometry.focus.chrome))restoreControl(previousGeometry.focus);
  }
  function remember() {last=snapshot();}
  function beforeRender() {
    const element=document.activeElement;
    const focus=element&&root.contains(element)?{
      id:element.id,tag:element.tagName,
      attrs:Object.entries(element.dataset),
      chrome:!!element.closest('.navigation,.document-tabs,.document-tools,.window-menu-group,.titlebar-tools'),
    }:null;
    geometry={navWidth:document.querySelector('.navigation')?.getBoundingClientRect().width||0,focus};
  }
  function restoreControl(focus) {
    const candidates=focus.id?[document.getElementById(focus.id)]:[...root.querySelectorAll('button,input,select,[tabindex]')];
    const target=candidates.find(element=>element&&element.tagName===focus.tag&&!element.disabled&&focus.attrs.every(([key,value])=>element.dataset[key]===value));
    if(target&&target.getClientRects().length)target.focus({preventScroll:true});
  }
  function settle(element) {
    // A pointer gesture always starts against the final, stationary geometry.
    element?.getAnimations().forEach(animation=>{try{animation.finish();}catch{animation.cancel();}});
  }
  function focusKey(container) {
    const element=document.activeElement;
    if(!element||!container.contains(element))return null;
    return element.dataset.action||null;
  }
  function restoreFocus(container,key,fallback) {
    if(!key)return;
    const candidates=[...container.querySelectorAll('[data-action]:not(:disabled)')];
    (candidates.find(element=>element.dataset.action===key)||candidates.find(element=>element.dataset.action===fallback))?.focus({preventScroll:true});
  }
  reduced.addEventListener('change',event=>{
    if(event.matches){running.forEach(animation=>animation.cancel());running.clear();}
  });
  return {play,enter,emphasize,beforeRender,afterRender,remember,settle,focusKey,restoreFocus,reduced,timing};
})();
