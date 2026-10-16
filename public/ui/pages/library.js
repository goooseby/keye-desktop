'use strict';

// 资料库页：课程列表、待整理筛选与回收站，共用同一套列表与侧栏（三种状态，一套结构）。

const LIBRARY_FILTERS=['all','pending','trash'];
const deletedMaterials=()=>state.materials.filter(m=>m.deleted);
// filter 只有三个合法值；任何历史遗留值（例如旧版的 exported）一律回到「全部课程」，避免出现无人渲染的中间状态。
function normalizeLibraryFilter(){if(!LIBRARY_FILTERS.includes(view.filter))view.filter='all';}
// 课程行：每门课一份数据（课件份数、页数、待整理数、最新课次）
function libraryCourseRows(query,pendingOnly){
  const groups=[...(state.courseLibrary||[])];
  if(sessions('unfiled').length)groups.push(courseById('unfiled'));
  let list=groups.map(c=>({...c,items:sessions(c.id)})).filter(c=>`${c.title} ${c.term}`.toLowerCase().includes(query)||c.items.some(m=>`${m.day} ${m.note||''}`.toLowerCase().includes(query)));
  if(pendingOnly)list=list.filter(c=>c.items.some(m=>!reviewed(m)));
  list.sort((a,b)=>view.sort==='name'?a.title.localeCompare(b.title,'zh'):Math.max(0,...b.items.map(m=>m.touched))-Math.max(0,...a.items.map(m=>m.touched)));
  return list.map(c=>{
    const pending=c.items.filter(m=>!reviewed(m)).length,latest=c.items.at(-1),pages=c.items.reduce((n,m)=>n+m.pages,0);
    return `<button class="library-home-row" data-nav="course/${esc(c.id)}" aria-label="打开课程 ${esc(c.title)}"><span class="library-home-cover">${cover({title:c.title,term:c.term,day:c.term||'课程资料',pages,coverKey:c.id,coverStyle:c.coverStyle,coverPalette:c.coverPalette})}</span><span class="library-home-course"><strong>${esc(c.title)}</strong><small>${esc(c.term||'学期未设置')}${latest?` · 最新 ${esc(latest.day)}`:''}</small></span><span class="library-home-count"><strong>${c.items.length} 份课件</strong><small>${pages} 页</small></span><span class="badge ${pending?'pending':'exported'}">${pending?pending+' 份待整理':c.items.length?'已全部整理':'等待添加课件'}</span><span class="library-home-enter">进入 ${icon('arrow')}</span></button>`;
  });
}
// 回收站行：被删除的课件，点击即恢复（与课程行同一个视觉组件）
function libraryTrashRows(query){
  const list=deletedMaterials().filter(m=>`${m.title} ${m.topic||''} ${m.day} ${m.note||''}`.toLowerCase().includes(query));
  list.sort((a,b)=>view.sort==='name'?String(a.note||a.title).localeCompare(String(b.note||b.title),'zh'):Number(b.touched||0)-Number(a.touched||0));
  return list.map(m=>`<button class="library-home-row" data-restore="${esc(m.id)}" aria-label="恢复 ${esc(m.title)}"><span class="library-home-cover">${cover(m)}</span><span class="library-home-course"><strong>${esc(m.note||m.title)}</strong><small>${esc(m.day)} · ${esc(m.source==='import'?'本地资料':'平台课件')}</small></span><span class="library-home-count"><strong>${m.pages} 页</strong><small>保留 ${m.pages-m.excluded.length} 页</small></span><span class="badge pending">已删除 · 点击恢复</span><span class="library-home-enter">恢复 ${icon('arrow')}</span></button>`);
}
function renderLibrary(){
  normalizeLibraryFilter();
  const trash=view.filter==='trash',query=view.search.toLowerCase();
  const rows=trash?libraryTrashRows(query):libraryCourseRows(query,view.filter==='pending');
  const allMaterials=activeMaterials();
  const last=allMaterials.find(m=>m.id===state.lastMaterial);
  const recent=[...allMaterials].sort((a,b)=>Number(b.touched||0)-Number(a.touched||0)).slice(0,4);
  const summary=trash?`${deletedMaterials().length} 份已删除的课件`:`${rows.length} 门课程 · 共 ${allMaterials.length} 份课件`;
  const emptyTitle=view.search?'没有找到相关课件':trash?'回收站是空的':'这里还没有相关课程';
  const emptyHint=view.search?'换个课程名或日期试试。':trash?'删除的课件会保留在这里，可随时恢复；已导出的文件不受影响。':'获取课件后自动按课程收纳，也可以新建课程并归入本地资料。';
  main.innerHTML=`<div class="page-heading library-home-heading"><div><h1>资料库</h1></div><div class="actions"><button data-course-action="new">新建课程</button><button data-action="import">导入文件</button><button class="primary" data-nav="acquire">获取课件</button></div></div>
  <div class="toolbar library-home-toolbar"><div class="tabs"><button data-filter="all" class="${view.filter==='all'?'active':''}">全部课程</button><button data-filter="pending" class="${view.filter==='pending'?'active':''}">有待整理课件</button><button data-filter="trash" class="${view.filter==='trash'?'active':''}">回收站</button></div><label class="search-box">${icon('search')}<input id="library-search" value="${esc(view.search)}" placeholder="搜索课程、日期…"></label></div>
  <div class="library-home-layout">
    <section class="library-home-primary" aria-label="${trash?'回收站课件':'课程列表'}">
      <div class="library-home-section-heading"><div><h2>${trash?'回收站':'课程列表'}</h2><span>${summary}</span></div><select id="library-sort" aria-label="课程排序"><option value="recent">最近整理优先</option><option value="name" ${view.sort==='name'?'selected':''}>按课程名称</option></select></div>
      <div class="library-home-list">${rows.length?rows.join(''):empty(emptyTitle,emptyHint,trash?'':'<button class="primary" data-nav="acquire">获取课件</button>')}</div>
    </section>
    <aside class="library-home-side" aria-label="最近整理与动态">
      <section class="library-home-panel library-home-resume"><h2>继续整理</h2>${last?`<strong>${esc(courseById(last.courseId).title)}</strong><p>${esc(last.day)} · ${esc(last.note||last.title)}</p><p>上次看到第 ${Number(last.lastPage||1)} / ${last.pages} 页</p><button class="primary" data-open="${esc(last.id)}">继续整理 ${icon('arrow')}</button>`:`<p>打开课件后，整理进度会自动保存在这里。</p><button data-nav="acquire">获取课件</button>`}</section>
      <section class="library-home-panel library-home-activity"><h2>最近课件</h2>${recent.length?recent.map(m=>`<button data-open="${esc(m.id)}"><strong>${esc(courseById(m.courseId).title)} · ${esc(m.note||m.title)}</strong><small>${esc(m.day)} · ${reviewed(m)?'已整理':'待整理'} · ${m.pages} 页</small></button>`).join(''):'<p>最近打开的课件会显示在这里。</p>'}</section>
    </aside>
  </div>`;
}
function searchInput(event){if(event.target.id==='library-search'&&!event.isComposing){const cursor=event.target.selectionStart;view.search=event.target.value;renderLibrary();$('#library-search').focus();$('#library-search').setSelectionRange(cursor,cursor);}}
document.addEventListener('input',searchInput);document.addEventListener('compositionend',searchInput);

// —— 资料库页的动作与表单注册 ——
registerDataHandlers({
  filter:element=>{view.filter=element.dataset.filter;renderLibrary();},
  restore:async element=>{await call('trash',{id:element.dataset.restore,deleted:false});toast('课件已恢复');},
});
registerActions({'clear-search':()=>{view.search='';renderLibrary();}});
registerFields({'library-sort':element=>{view.sort=element.value;renderLibrary();}});