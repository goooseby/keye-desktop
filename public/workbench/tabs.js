'use strict';

// One workspace owns tab identity and lifecycle. File edits and background jobs
// belong to their models; a tab owns only its transient viewing session.
const WorkspaceTabs = (() => {
  const pages = {
    library:{label:'资料库',icon:'files',pinned:true},
    editor:{icon:'file'},
    acquire:{label:'获取课件',icon:'download'},
    tasks:{label:'任务',icon:'tasks'},
    settings:{label:'设置',icon:'settings'},
  };
  const items = [{id:'library',page:'library',session:{}}];
  let activeId = 'library';
  const active = () => items.find(tab=>tab.id===activeId);
  function capture() {
    const tab=active();
    if(!tab)return;
    captureLibraryScroll();captureReviewScroll();
    if(tab.page==='editor')tab.session={
      current:ui.current,onlyKept:ui.onlyKept,zoom:ui.zoom,
      selected:new Set(reviewUi.selected),anchor:reviewUi.anchor,
    };
    else tab.session.scroll=document.querySelector('#page > .content')?.scrollTop||0;
  }
  function activate(id,{focus=false,preserveReview=false}={}) {
    if(WorkbenchBusiness.enabled&&!WorkbenchBusiness.canLeave())return;
    const tab=items.find(item=>item.id===id);
    if(!tab)return;
    if(tab.page==='editor'&&!files.some(file=>file.id===tab.fileId&&!file.deleted))return;
    if(WorkbenchBusiness.enabled&&!preserveReview)WorkbenchBusiness.endReview();
    hideList();
    if(activeId!==id){
      closeViewer();capture();activeId=id;ui.page=tab.page;ui.crop=null;
      if(tab.page==='editor'){
        const file=files.find(file=>file.id===tab.fileId),session=tab.session;
        ui.openFile=file.id;ui.current=session.current||file.lastPage;
        ui.onlyKept=session.onlyKept||false;ui.zoom=session.zoom||100;
        reviewUi.selected=new Set(session.selected||[]);reviewUi.anchor=session.anchor??null;
        reviewUi.shift=false;
      }
    }
    if(tab.page==='editor'){ui.recent=[tab.fileId,...ui.recent.filter(id=>id!==tab.fileId)];if(WorkbenchBusiness.enabled)WorkbenchBusiness.opened(tab.fileId);}
    render();
    if(focus)document.querySelector('.document-tab.active')?.focus({preventScroll:true});
  }
  function open(page,fileId,options={}) {
    if(!pages[page])return;
    if(page==='editor'&&!files.some(file=>file.id===fileId&&!file.deleted))return;
    const id=page==='editor'?'file:'+fileId:page;
    if(!items.some(tab=>tab.id===id))items.push({id,page,fileId,session:{}});
    activate(id,options);
  }
  function close(id,{focus=false}={}) {
    if(WorkbenchBusiness.enabled&&!WorkbenchBusiness.canLeave())return;
    const index=items.findIndex(tab=>tab.id===id);
    if(index<0||pages[items[index].page].pinned)return;
    const wasActive=activeId===id;
    if(wasActive){closeViewer();capture();}
    const [closed]=items.splice(index,1);
    if(wasActive)activate(items[Math.min(index,items.length-1)].id,{focus});
    else {render();if(focus)document.querySelector('.document-tab.active')?.focus({preventScroll:true});}
    if(closed.page==='editor'){
      reviewUi.scrolls.delete(closed.fileId+':true');reviewUi.scrolls.delete(closed.fileId+':false');
    }
  }
  function describe(tab) {
    return {...pages[tab.page],label:tab.page==='editor'?files.find(file=>file.id===tab.fileId)?.title||'课件':pages[tab.page].label};
  }
  function markup() {
    return items.map(tab=>{
      const spec=describe(tab),on=tab.id===activeId,key=escapeHtml(tab.id);
      return `<div class="document-tab-slot ${on?'active':''} ${tab.page==='editor'?'file-tab':''}">
        <button id="workspace-tab-${key}" class="document-tab ${on?'active':''}" data-tab="${key}" role="tab" aria-selected="${on}" aria-controls="page" tabindex="${on?0:-1}" title="${escapeHtml(spec.label)}">${icon(spec.icon)}<span class="ellipsis">${escapeHtml(spec.label)}</span></button>
        ${spec.pinned?'':button('','close-tab','close','tab-close',`data-tab-id="${key}" tabindex="${on?0:-1}" title="关闭 ${escapeHtml(spec.label)}" aria-label="关闭 ${escapeHtml(spec.label)}"`)}
      </div>`;
    }).join('');
  }
  function afterRender() {
    const tab=active(),content=document.querySelector('#page > .content');
    if(content)content.scrollTop=tab.session.scroll||0;
    const page=document.querySelector('#page');
    page.dataset.workspaceTab=activeId;
    page.setAttribute('role','tabpanel');page.setAttribute('aria-labelledby','workspace-tab-'+activeId);
  }
  function step(direction) {
    activate(items[(items.findIndex(tab=>tab.id===activeId)+direction+items.length)%items.length].id,{focus:true});
  }
  function showList() {
    hideAppMenu(false);
    const menu=document.querySelector('#tab-menu');
    if(menu.matches(':popover-open')){hideList(true);return;}
    menu.innerHTML=`<div class="menu-label">打开的标签页 · ${items.length}</div>`+items.map(tab=>{
      const spec=describe(tab);
      return `<button role="menuitem" tabindex="-1" data-tab="${escapeHtml(tab.id)}" title="${escapeHtml(spec.label)}">${icon(spec.icon)}<span class="ellipsis">${escapeHtml(spec.label)}</span>${tab.id===activeId?icon('check'):''}</button>`;
    }).join('');
    const trigger=document.querySelector('[data-action="tab-list"]'),rect=trigger.getBoundingClientRect();
    menu.style.left=Math.max(8,Math.min(innerWidth-300,rect.right-300))+'px';menu.style.top=rect.bottom+5+'px';
    menu.style.maxHeight=Math.max(100,innerHeight-rect.bottom-13)+'px';
    menu.showPopover();trigger.setAttribute('aria-expanded','true');
    menu.querySelector(`[data-tab="${CSS.escape(activeId)}"]`)?.focus();
  }
  function hideList(focus=false) {
    const menu=document.querySelector('#tab-menu');
    if(menu?.matches(':popover-open'))menu.hidePopover();
    const trigger=document.querySelector('[data-action="tab-list"]');trigger?.setAttribute('aria-expanded','false');
    if(focus)trigger?.focus({preventScroll:true});
  }
  function reset(){items.splice(1);items[0].session={};activeId='library';ui.page='library';ui.openFile=null;reviewUi.selected.clear();ui.crop=null;}
  function reconcile(valid){
    for(let i=items.length-1;i>=1;i--)if(items[i].page==='editor'&&!valid.has(items[i].fileId)){
      if(items[i].id===activeId){closeViewer();activeId='library';ui.page='library';ui.crop=null;}
      items.splice(i,1);
    }
  }
  return {open,activate,close,markup,afterRender,capture,step,showList,hideList,reset,reconcile,
    get activeId(){return activeId;},get count(){return items.length;}};
})();
