// 逐页冒烟：资料库三个状态、课程页、整理页、浮层、导出与帮助、其余页面无脚本错误。
// 前置：用 scripts/inspect.ps1 启动开发版（带 WebView2 调试端口），再执行 node scripts/dev/check-pages.mjs

import { evaluate } from './cdp.mjs';

const list = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const target = list.find(t => t.type === 'page' && (t.url || '').includes('5173'));
if (!target) { console.error('未找到应用页面'); process.exit(1); }

const expression = `(async()=>{
  const out={pages:{},errors:[],asserts:{}};
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const raf=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
  const box=s=>document.querySelector(s);
  const all=s=>[...document.querySelectorAll(s)];
  const check=(name,value)=>{out.asserts[name]=value;};
  window.addEventListener('error',event=>out.errors.push('error: '+event.message));
  window.addEventListener('unhandledrejection',event=>out.errors.push('rejection: '+String(event.reason&&event.reason.message||event.reason)));

  check('modules',{dom:typeof icon==='function',state:typeof sessions==='function',media:typeof applyCropViews==='function',actions:typeof runAction==='function',library:typeof libraryCourseRows==='function',course:typeof renderCourse==='function',editor:typeof renderEditor==='function',crop:typeof toggleCropMode==='function',acquire:typeof acquireMarkup==='function',tasks:typeof renderTasks==='function',about:typeof renderAbout==='function',settings:typeof renderSettings==='function'});
  check('startKeye',typeof window.startKeye==='function');
  check('legacyGone',{legacy:typeof renderLegacyLibrary==='undefined',statusOf:typeof statusOf==='undefined',layout:!document.querySelector('script[src*="layout.js"]'),courses:!document.querySelector('script[src*="courses.js"]')});

  // 资料库三个标签
  view.filter='all';location.hash='library';await wait(500);
  out.pages.library={h1:box('h1')?.textContent,eyebrow:!!box('.eyebrow'),subtitle:!!box('.subtitle'),tabs:all('.tabs button').map(b=>b.textContent.trim()),rows:all('.library-home-row').length,sidebar:!!box('.library-home-side')};
  for(const filter of ['all','pending','trash']){
    box('[data-filter="'+filter+'"]')?.click();await wait(220);
    out.pages['library-'+filter]={active:box('.tabs button.active')?.textContent.trim(),rows:all('.library-home-row').length,empty:box('.library-home-list .empty')?.textContent.slice(0,24)||null,heading:box('.library-home-section-heading h2')?.textContent};
  }
  // 幽灵状态归一化：旧版遗留的 exported 不应进入无人渲染的中间态
  view.filter='exported';renderLibrary();await wait(120);
  check('ghostFilterNormalized',{filter:view.filter,active:box('.tabs button.active')?.textContent.trim()});
  view.filter='all';renderLibrary();await wait(120);

  // 课程页
  const row=box('.library-home-row[data-nav^="course/"]');row?.click();await wait(600);
  out.pages.course={page:view.page,h1:box('h1')?.textContent,rows:all('.session-row').length,backButton:!!box('.back-button'),batch:!!box('.course-batch')};
  box('.back-button')?.click();await wait(400);

  // 整理页
  const picked=activeMaterials()[0];view.materialId=picked.id;view.page='editor';view.currentPage=1;view.selected.clear();view.crop=null;render();await wait(700);
  out.pages.editor={h1:box('h1')?.textContent,tiles:all('.page-tile').length,filterButtons:all('[data-page-filter]').length,panel:!!box('.preview-panel'),cropFlagVisible:all('.crop-flag').length};
  box('[data-page-check="2"]')?.click();await wait(200);
  check('selection',{label:box('.editor-toolbar .selected-label')?.textContent,selected:[...view.selected]});
  box('[data-action="select-all-pages"]')?.click();await wait(200);
  check('selectAll',{label:box('.editor-toolbar .selected-label')?.textContent,count:view.selected.size,pages:picked.pages});
  box('[data-action="select-all-pages"]')?.click();await wait(200);
  check('selectNone',{count:view.selected.size});
  showFullscreen();await raf();await wait(300);
  out.pages.fullscreen={open:modal.open,cropButton:box('[data-action="crop-toggle"]')?.textContent.trim(),pager:!!box('.nav-pager'),exclude:!!box('.nav-exclude')};
  box('[data-action="crop-toggle"]')?.click();await raf();await wait(300);
  out.pages.cropMode={frame:view.crop&&[view.crop.x,view.crop.y,view.crop.w,view.crop.h],pager:!!box('.nav-pager'),controls:all('#fullscreen-crop-tools button').map(b=>b.textContent.trim()),handles:all('.crop-handle').length};
  box('[data-action="crop-toggle"]')?.click();await raf();await wait(200);
  showExport();await wait(200);
  out.pages.exportDialog={open:modal.open,stat:box('.modal-stat')?.textContent};
  closeModal();await wait(200);
  showHelp();await wait(150);
  check('help',{open:modal.open,title:box('.modal-header h2')?.textContent});
  closeModal();await wait(150);

  // 其余页面
  for(const [route,key] of [['acquire','acquire'],['tasks','tasks'],['about','about'],['settings','settings']]){
    location.hash=route;await wait(500);
    out.pages[key]={h1:box('h1')?.textContent,eyebrow:!!box('.eyebrow'),subtitle:!!box('.subtitle'),buttons:all('#main button').length};
  }
  location.hash='library';await wait(400);
  return JSON.stringify(out,null,2);
})()`;

console.log(JSON.stringify(await evaluate(expression), null, 2));
