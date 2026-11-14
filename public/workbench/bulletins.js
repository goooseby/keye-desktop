'use strict';

// Text-only announcements and signed updater results share one inbox and prompt scheduler.
const WorkbenchBulletinPolicy = (() => {
  const compare=(a,b)=>{const x=String(a).replace(/^v/,'').split('.').map(Number),y=String(b).replace(/^v/,'').split('.').map(Number);for(let i=0;i<3;i++){const delta=(x[i]||0)-(y[i]||0);if(delta)return Math.sign(delta);}return 0;};
  function unread(item,current){return !item.read&&!item.expired&&(item.kind!=='update'||compare(item.version,current)>0);}
  function next(items,{current,autoShow=true,autoUpdate=true,preferences={},now=Date.now()}={}){
    return items.filter(item=>unread(item,current)&&item.remindAfter<=now&&(item.kind==='update'?autoUpdate&&preferences.ignoredVersion!==item.version&&!(preferences.remindVersion===item.version&&preferences.remindAfter>now):autoShow))
      .sort((a,b)=>(b.kind==='update')-(a.kind==='update')||Date.parse(b.publishedAt)-Date.parse(a.publishedAt))[0];
  }
  function text(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function markup(value){
    const inline=value=>text(value).replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/`([^`]+)`/g,'<code>$1</code>');
    return String(value||'').split(/\n\s*\n/).map(block=>{
      const lines=block.split('\n');
      if(lines.every(line=>/^\s*[-*]\s+/.test(line)))return '<ul>'+lines.map(line=>'<li>'+inline(line.replace(/^\s*[-*]\s+/,''))+'</li>').join('')+'</ul>';
      return '<p>'+inline(block.replace(/^#{1,6}\s+/,'')).replace(/\n/g,'<br>')+'</p>';
    }).join('');
  }
  return {compare,unread,next,markup,text};
})();

const WorkbenchBulletins = (() => {
  let service=null,feed={items:[],autoShow:true},update=null,selected=null,loading=false,downloaded=false,downloading=false,installing=false,progress=0;
  let error='',updateError='',automaticShown=false,automaticView=false,ready=false,timer=null,inflight=null,focusBefore=null;
  const policy=WorkbenchBulletinPolicy;
  const live=()=>typeof WorkbenchBusiness!=='undefined'&&WorkbenchBusiness.enabled;
  const snapshot=()=>WorkbenchBusiness.snapshot||{};
  const current=()=>snapshot().appVersion||'0.5.0';
  const preferences=()=>snapshot().updatePreferences||{};
  const call=(command,data={})=>service.call(command,data);
  function items(){
    const result=[...feed.items];
    if(update?.available){
      const matching=result.find(item=>item.kind==='update'&&item.version===update.latest);
      if(matching)result.splice(result.indexOf(matching),1);
      result.unshift({key:'release:'+update.latest,kind:'update',version:update.latest,title:matching?.title||'华工课栈 v'+update.latest+' 已发布',body:matching?.body||update.notes||'此版本包含功能改进与问题修复。',publishedAt:matching?.publishedAt||'',read:false,remindAfter:0,expired:false,release:true});
    }
    return result;
  }
  const count=()=>items().filter(item=>policy.unread(item,current())).length;
  function badge(){const number=count();return `<button class="icon-button bulletin-trigger ${number?'has-unread':''}" data-action="bulletins" aria-label="公告与更新${number?'，'+number+' 条未读':''}" title="公告与更新${number?' · '+number+' 条未读':''}">${icon('bell')}${number?'<i aria-hidden="true"></i>':''}</button>`;}
  function syncBadge(){document.querySelectorAll('.bulletin-trigger').forEach(button=>{const holder=document.createElement('div');holder.innerHTML=badge();const updated=holder.firstElementChild;button.className=updated.className;button.title=updated.title;button.setAttribute('aria-label',updated.getAttribute('aria-label'));button.innerHTML=updated.innerHTML;});}
  function element(){
    let modal=document.getElementById('bulletin-dialog');if(modal)return modal;
    modal=document.createElement('dialog');modal.id='bulletin-dialog';modal.className='bulletin-dialog';modal.setAttribute('aria-labelledby','bulletin-title');document.body.append(modal);
    modal.addEventListener('cancel',event=>{event.preventDefault();void dismiss();});
    modal.addEventListener('click',event=>{
      if(event.target===modal){const box=modal.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)void dismiss();return;}
      const control=event.target.closest('[data-bulletin]');if(!control)return;
      const action=control.dataset.bulletin;
      if(action==='select'){selected=control.dataset.key;modal.querySelector('.bulletin-body').scrollTop=0;render();return;}
      if(action==='close')void dismiss();
      if(action==='refresh')void refresh(true);
      if(action==='read'||action==='later'||action==='ignore')void acknowledge(action);
      if(action==='download')void download();
      if(action==='install')void install();
    });
    return modal;
  }
  function render(){
    syncBadge();const modal=document.getElementById('bulletin-dialog');if(!modal?.open)return;
    const scroll=modal.querySelector('.bulletin-body')?.scrollTop||0;
    const focused=modal.contains(document.activeElement)?{action:document.activeElement.dataset.bulletin,key:document.activeElement.dataset.key}:null;
    const list=items();if(!list.some(item=>item.key===selected))selected=list[0]?.key;
    const item=list.find(item=>item.key===selected),canUpdate=item?.kind==='update'&&update?.available&&item.version===update.latest;
    const status=downloading?`正在下载并校验更新${progress?' · '+progress+'%':''}`:downloaded?'更新已下载并通过签名校验':updateError||error||(loading?'正在刷新公告与更新…':update&&!update.available?'当前已是最新版本。':'');
    const controls=item?`<div class="bulletin-footer-copy">${item.expired?'此公告已到期':item.kind==='update'?(policy.compare(item.version,current())<=0?'当前已安装此版本或更新版本':'更新会保留本地资料库'):(item.read?'已阅读':'阅读后可标为已读，不再自动提醒')}</div><div class="bulletin-footer-actions">${!item.expired&&policy.unread(item,current())?`<button data-bulletin="later">稍后提醒</button>`:''}${item.release?`<button data-bulletin="ignore" ${downloading?'disabled':''}>忽略此版本</button>`:!item.read?'<button data-bulletin="read" class="primary">已阅读</button>':''}${canUpdate?`<button data-bulletin="${downloaded?'install':'download'}" class="primary" ${downloading||installing?'disabled':''}>${icon(downloaded?'refresh':'download')}${installing?'正在安装…':downloading?'下载中…':downloaded?'安装并重启':'下载更新'}</button>`:item?.kind==='update'&&policy.compare(item.version,current())>0?'<button data-bulletin="refresh">检查可用更新</button>':''}</div>`:'<button data-bulletin="close">关闭</button>';
    modal.innerHTML=`<header class="bulletin-heading"><div><h2 id="bulletin-title">公告与更新</h2><span>华工课栈 · v${policy.text(current())}</span></div><div class="bulletin-heading-actions"><button class="icon-button" data-bulletin="refresh" aria-label="刷新公告与更新" title="刷新" ${loading?'disabled':''}>${icon('refresh')}</button><button class="icon-button" data-bulletin="close" aria-label="关闭公告与更新">${icon('close')}</button></div></header>
      <div class="bulletin-layout"><nav class="bulletin-list" aria-label="公告列表">${list.map(row=>`<button data-bulletin="select" data-key="${policy.text(row.key)}" class="${row.key===selected?'selected':''}" aria-current="${row.key===selected?'true':'false'}"><span class="bulletin-item-meta">${row.kind==='update'?'版本更新':'应用公告'}${policy.unread(row,current())?'<i aria-label="未读"></i>':''}</span><strong>${policy.text(row.title)}</strong><small>${row.publishedAt?new Date(row.publishedAt).toLocaleDateString('zh-CN'):row.version?'v'+policy.text(row.version):''}${row.expired?' · 已到期':''}</small></button>`).join('')||'<div class="bulletin-list-empty">暂无公告</div>'}</nav>
      <article class="bulletin-body">${item?`<span class="bulletin-category ${item.kind==='update'?'is-update':''}">${icon(item.kind==='update'?'download':'bell')}${item.kind==='update'?'版本更新':'应用公告'}</span><h3>${policy.text(item.title)}</h3><div class="bulletin-date">${item.publishedAt?new Date(item.publishedAt).toLocaleDateString('zh-CN',{year:'numeric',month:'long',day:'numeric'}):'新版本现已可用'}${item.read?' · 已阅读':''}</div><div class="bulletin-prose">${policy.markup(item.body)}</div>`:`<div class="bulletin-empty">${icon('bell')}<h3>${loading?'正在获取公告…':'暂时没有公告'}</h3><p>${loading?'请稍候，内容将在这里显示。':'新的使用提示和版本消息会集中显示在这里。'}</p></div>`}</article></div>
      <div class="bulletin-status ${status?'':'is-hidden'}" role="status">${policy.text(status)}${downloading?`<progress max="100" value="${progress}" aria-label="更新下载进度"></progress>`:''}</div><footer class="bulletin-footer">${controls}</footer>`;
    if(modal.querySelector('.bulletin-body'))modal.querySelector('.bulletin-body').scrollTop=scroll;
    if(focused?.action)[...modal.querySelectorAll('[data-bulletin]')].find(control=>control.dataset.bulletin===focused.action&&control.dataset.key===focused.key)?.focus({preventScroll:true});
  }
  async function refresh(manual=false){
    if(!service)return;
    if(inflight)return inflight;
    loading=true;error='';updateError='';render();
    inflight=(async()=>{
      const jobs=[call('announcements',{manual}),snapshot().packaged&&(manual||preferences().autoCheck!==false)?call('checkUpdate'):Promise.resolve(null)];
      const [announcements,release]=await Promise.allSettled(jobs);
      if(announcements.status==='fulfilled'){feed=announcements.value;error=feed.error||'';}else error='公告暂不可用，可以稍后刷新。';
      if(release.status==='fulfilled'){if(release.value)update=release.value;}else if(manual)updateError='暂时无法检查版本更新，请稍后重试。';
    })().finally(()=>{loading=false;ready=true;inflight=null;render();schedulePrompt();});
    return inflight;
  }
  function show(key=null,{automatic=false}={}){
    if(!live())return notify('公告与更新请在桌面应用中查看。');
    const modal=element();focusBefore=document.activeElement;selected=key||items().find(item=>policy.unread(item,current()))?.key||items()[0]?.key;automaticView=automatic;
    if(!modal.open)modal.showModal();render();modal.querySelector('[data-bulletin="close"]')?.focus();
    if(!ready&&!loading)void refresh(true);
  }
  async function acknowledge(action){
    const item=items().find(item=>item.key===selected);if(!item)return;
    try{
      if(item.release){await call('updatePreferences',action==='ignore'?{ignoredVersion:item.version,remindVersion:'',remindAfter:0}:{remindVersion:item.version,remindAfter:Date.now()+86400000});await WorkbenchBusiness.refresh();}
      else feed=await call('announcementReceipt',{key:item.key,action:action==='read'?'read':'later'});
      automaticView=false;
      if(action==='read'){render();notify('已标为已读。','success');}else close();
    }catch{notify('提醒状态未能保存，请重试。','warning');}
  }
  function close(){const modal=document.getElementById('bulletin-dialog');modal?.close();automaticView=false;syncBadge();(focusBefore?.isConnected?focusBefore:document.querySelector('.bulletin-trigger'))?.focus({preventScroll:true});}
  async function dismiss(){if(automaticView){await acknowledge('later');}else close();}
  function candidate(){return policy.next(items(),{current:current(),autoShow:feed.autoShow,autoUpdate:preferences().autoCheck!==false,preferences:preferences()});}
  function maybePrompt(){
    clearTimeout(timer);if(!ready||automaticShown||!snapshot().packaged||!candidate())return;
    const blocked=loading||WorkbenchBusiness.busy||WorkbenchBusiness.exporting||ui.page==='editor'||ui.crop||document.querySelector('dialog[open]')||document.visibilityState!=='visible'||!document.hasFocus();
    if(blocked){timer=setTimeout(maybePrompt,1500);return;}
    automaticShown=true;show(candidate().key,{automatic:true});
  }
  function schedulePrompt(){clearTimeout(timer);timer=setTimeout(maybePrompt,1200);}
  async function download(){
    if(downloading||!update?.available)return;downloading=true;updateError='';render();
    try{await call('downloadUpdate');downloaded=true;}catch(reason){updateError=reason?.message||String(reason);}finally{downloading=false;render();}
  }
  async function install(){
    if(installing||!downloaded)return;
    if(WorkbenchBusiness.busy||WorkbenchBusiness.exporting||ui.scanning||ui.crop||ui.tasks.some(t=>['queued','running','paused'].includes(t.status)))return notify('请先完成或取消当前操作和后台任务，再安装更新。');
    installing=true;updateError='';render();
    try{await WorkbenchBusiness.flushPages();await call('installUpdate');}catch(reason){updateError=reason?.message||String(reason);}finally{installing=false;render();}
  }
  async function toggle(){try{feed=await call('announcementReceipt',{autoShow:!(snapshot().announcementPreferences?.autoShow??feed.autoShow)});await WorkbenchBusiness.refresh();schedulePrompt();}catch{notify('公告提醒设置未能保存。','warning');}}
  function start(bridge){service=bridge;let progressTimer=null;window.addEventListener('keye-update-progress',event=>{progress=event.detail;if(!progressTimer)progressTimer=setTimeout(()=>{progressTimer=null;render();},150);});window.addEventListener('focus',schedulePrompt);if(snapshot().packaged)void refresh(false);}
  function handleAction(name){if(!live())return false;if(['bulletins','check-update'].includes(name)){show();if(ready)void refresh(true);return true;}if(name==='announcement-auto'){void toggle();return true;}return false;}
  return {start,show,refresh,handleAction,badge,syncBadge,get autoShow(){return snapshot().announcementPreferences?.autoShow??feed.autoShow;}};
})();
