'use strict';

// Shared update workflow: startup check, persistent reminder policy, badge and dialog.
const updatePreferences=()=>({autoCheck:true,ignoredVersion:'',remindVersion:'',remindAfter:0,...state.updatePreferences});
function syncUpdateBadge(){
  const badge=$('#app-update-badge');if(!badge)return;
  badge.hidden=!updateState.info?.available;
  badge.title=updateState.info?.available?`发现 v${updateState.info.latest}，查看更新日志`:'';
}
function canPromptUpdate(now=Date.now()){
  const preferences=updatePreferences(),version=updateState.info?.latest;
  return !!(state.packaged&&preferences.autoCheck&&updateState.info?.available&&version!==preferences.ignoredVersion
    &&version!==updateState.promptedVersion&&!(preferences.remindVersion===version&&preferences.remindAfter>now)
    &&!updateState.checking&&!updateState.downloading&&!modal.open&&!view.saving&&!view.exporting
    &&view.page!=='editor'&&view.page!=='about'&&document.visibilityState!=='hidden'&&document.hasFocus());
}
function maybePromptUpdate(){if(canPromptUpdate())showUpdateDialog();}
function scheduleUpdateReminder(){
  clearTimeout(updateState.reminderTimer);
  const preferences=updatePreferences(),version=updateState.info?.latest;
  if(!preferences.autoCheck||preferences.remindVersion!==version||preferences.remindAfter<=Date.now())return;
  const delay=Math.min(preferences.remindAfter-Date.now()+50,2147483647);
  updateState.reminderTimer=setTimeout(()=>{
    if(updateState.info?.latest===version){updateState.promptedVersion='';maybePromptUpdate();scheduleUpdateReminder();}
  },delay);
}
function refreshUpdateUi(){syncUpdateBadge();renderUpdateStatus();renderUpdateDialogStatus();}
async function saveUpdatePreferences(patch){
  state.updatePreferences=await call('updatePreferences',patch);syncUpdateBadge();scheduleUpdateReminder();
}
async function checkForUpdates({manual=false}={}){
  if(!state.packaged)return null;
  if(updateState.checkPromise)return updateState.checkPromise;
  if(updateState.downloading||updateState.ready)return updateState.info;
  updateState.checking=true;updateState.error='';refreshUpdateUi();
  updateState.checkPromise=Promise.resolve().then(()=>call('checkUpdate')).then(info=>{
    updateState.info=info;return info;
  }).catch(error=>{
    if(manual)updateState.error=error.message||String(error);
    return null; // Offline startup must never block the workspace or raise a modal.
  }).finally(()=>{
    updateState.checking=false;updateState.checkPromise=null;refreshUpdateUi();scheduleUpdateReminder();
    if(!manual)maybePromptUpdate();
  });
  return updateState.checkPromise;
}
function scheduleStartupUpdateCheck(){
  if(updateState.startupScheduled||!state.packaged||!updatePreferences().autoCheck)return;
  updateState.startupScheduled=true;
  setTimeout(()=>{if(updatePreferences().autoCheck)void checkForUpdates();},1500);
}
function updateNotesHtml(notes){
  const inline=text=>esc(text).replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/`([^`]+)`/g,'<code>$1</code>');
  const output=[];let inList=false;
  for(const line of String(notes).split(/\r?\n/)){
    const bullet=line.match(/^\s*[-*+]\s+(.+)$/);
    if(bullet){if(!inList){output.push('<ul>');inList=true;}output.push(`<li>${inline(bullet[1])}</li>`);continue;}
    if(inList){output.push('</ul>');inList=false;}
    const heading=line.match(/^#{1,6}\s+(.+)$/);
    if(heading)output.push(`<h4>${inline(heading[1])}</h4>`);
    else if(line.trim())output.push(`<p>${inline(line)}</p>`);
  }
  if(inList)output.push('</ul>');return output.join('');
}
function showUpdateDialog(){
  const info=updateState.info;if(!info?.available)return;
  if(modal.open){if(modal.dataset.updateVersion)renderUpdateDialogStatus();return;}
  updateState.promptedVersion=info.latest;
  const notes=info.notes||'本次更新未附带详细日志，可查看正式版本页面。';
  showModal('课页有新版本',`<div class="update-dialog-summary"><img src="/app-icon.svg" alt=""><div><h3>发现新版本 v${esc(info.latest)}</h3><p>当前版本 v${esc(state.appVersion||'')} ${info.size?` · 下载约 ${(info.size/1024/1024).toFixed(1)} MB`:''}</p></div></div><h3 class="update-log-title">本次更新</h3><div class="update-dialog-notes">${updateNotesHtml(notes)}</div><p id="update-dialog-status" role="status"></p><div class="update-meter" id="update-dialog-meter" hidden><span id="update-dialog-meter-fill"></span></div><p class="update-dialog-footnote">更新包将校验签名；安装前请完成当前任务，资料库会保留。</p>`,
    '<button class="quiet" data-action="ignore-update">忽略此版本</button><button data-action="remind-update">稍后提醒</button><button class="primary" data-update-dialog-download data-action="download-update">下载更新</button><button class="primary" data-update-dialog-install data-action="install-update" hidden>重启并安装</button>');
  modal.classList.add('update-modal');modal.dataset.updateVersion=info.latest;renderUpdateDialogStatus();
}
function renderUpdateDialogStatus(){
  const status=$('#update-dialog-status');if(!modal.open||!modal.dataset.updateVersion||!status)return;
  status.textContent=updateState.error||(updateState.downloading?`正在下载并校验更新${updateState.progress?`：${updateState.progress}%`:'…'}`:updateState.ready?'下载和校验完成，可以重启并安装。':'可以先查看更新日志，稍后提醒将在 24 小时后恢复。');
  const meter=$('#update-dialog-meter');meter.hidden=!updateState.downloading;$('#update-dialog-meter-fill').style.width=updateState.progress+'%';
  const download=$('[data-update-dialog-download]'),install=$('[data-update-dialog-install]');
  download.hidden=updateState.ready;download.disabled=updateState.checking||updateState.downloading;
  download.textContent=updateState.downloading?'下载中…':updateState.error?'重新下载':'下载更新';
  install.hidden=!updateState.ready;install.disabled=!!updateState.installing;
}
async function dismissUpdate(kind){
  const version=modal.dataset.updateVersion||updateState.info?.latest;if(!version)return;
  await saveUpdatePreferences(kind==='ignore'?{ignoredVersion:version,remindVersion:'',remindAfter:0}:{remindVersion:version,remindAfter:Date.now()+24*60*60*1000});
  delete modal.dataset.updateVersion;closeModal();syncUpdateBadge();
}
async function downloadUpdate(){
  if(!state.packaged||!updateState.info?.available||updateState.checking||updateState.downloading||updateState.ready)return;
  updateState.downloading=true;updateState.progress=0;updateState.error='';refreshUpdateUi();
  try{await call('downloadUpdate');updateState.ready=true;}
  catch(error){updateState.error=error.message||String(error);}
  finally{updateState.downloading=false;refreshUpdateUi();}
}
async function installUpdate(){
  if(!state.packaged||!updateState.ready||updateState.installing)return;
  if(view.saving||view.exporting||state.tasks.some(task=>['queued','running','paused'].includes(task.status)))return toast('请先完成或取消后台任务，再重启安装更新。');
  updateState.installing=true;updateState.error='';refreshUpdateUi();
  try{await call('installUpdate');}
  catch(error){updateState.error=error.message||String(error);}
  finally{updateState.installing=false;refreshUpdateUi();}
}
modal.addEventListener('close',()=>{
  if(modal.open)return;
  const version=modal.dataset.updateVersion;delete modal.dataset.updateVersion;modal.classList.remove('update-modal');
  if(version)void saveUpdatePreferences({remindVersion:version,remindAfter:Date.now()+24*60*60*1000}).catch(fail);
  setTimeout(maybePromptUpdate,100);
});
window.addEventListener('focus',()=>{setTimeout(maybePromptUpdate,250);});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')maybePromptUpdate();});
registerActions({
  'view-update':()=>showUpdateDialog(),
  'ignore-update':()=>dismissUpdate('ignore'),
  'remind-update':()=>dismissUpdate('later'),
  'reset-update-reminders':async()=>{await saveUpdatePreferences({ignoredVersion:'',remindVersion:'',remindAfter:0});updateState.promptedVersion='';renderSettings();toast('已恢复新版本提醒');},
});
