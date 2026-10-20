'use strict';

// 设置页：资料库位置、导出目录与下载参数。

function renderSettings(){
  const s=state.settings,preferences=updatePreferences();
  main.innerHTML=`<div class="page-heading"><div><h1>设置</h1></div></div><div class="settings-grid"><div><section class="panel settings-section"><h2>资料库与存储</h2><div class="setting-row"><div><h3>资料库位置</h3></div><div class="actions"><button data-action="open-library">打开目录</button><button data-action="choose-library">切换资料库</button></div></div><div class="setting-path">${esc(s.libraryDir)}</div><div class="setting-row"><div><h3>保留原始页面</h3></div><span class="badge exported">默认保留</span></div><div class="setting-row"><div><h3>自动保存整理进度</h3></div><span class="badge exported">已开启</span></div></section><section class="panel settings-section"><h2>下载与导出</h2><div class="setting-row"><div><h3>获取课件后</h3></div><select id="default-export" class="field-input"><option value="review" ${s.exportMode==='review'?'selected':''}>先整理，再导出</option><option value="direct" ${s.exportMode==='direct'?'selected':''}>直接导出 PDF</option></select></div><div class="setting-row"><div><h3>默认 PDF 导出目录</h3></div><button data-action="choose-export-dir">选择目录</button></div><div class="setting-path ${s.exportDir?'':'unset-path'}">${s.exportDir?esc(s.exportDir):'尚未设置 · 首次导出时再选择'}</div><div class="settings-numbers">${[['maxWorkers','同时下载课件数',1,4],['timeout','请求超时（秒）',5,600],['retries','下载尝试次数',1,10],['sleepMs','请求间隔（毫秒）',0,5000]].map(([id,label,min,max])=>`<label class="field">${label}<input type="number" id="setting-${id}" min="${min}" max="${max}" value="${s[id]}"></label>`).join('')}</div><button class="secondary" data-action="save-settings">保存下载参数</button></section><section class="panel settings-section"><h2>应用更新</h2><div class="setting-row"><div><h3>启动时自动检查更新</h3></div><input class="toggle" type="checkbox" role="switch" id="auto-update-check" aria-label="启动时自动检查更新" ${preferences.autoCheck?'checked':''}></div>${preferences.ignoredVersion||preferences.remindAfter>Date.now()?`<div class="setting-row"><div><h3>更新提醒</h3></div><button data-action="reset-update-reminders">恢复提醒</button></div>`:''}</section></div><aside class="guide-card">${icon('folder')}<h3 style="margin-top:16px">资料留在本机</h3><div class="number">${activeMaterials().length}<span style="font-size:12px;margin-left:8px">份课件</span></div></aside></div>`;
}

// —— 设置页的动作注册 ——
registerActions({
  'open-library':()=>call('openLibrary'),
  'choose-export-dir':()=>call('chooseExportDir'),
  'choose-library':()=>showModal('切换资料库', '<p>选择一个新的空目录，或打开以前的资料库。当前资料会保留在原目录，不会自动搬迁。</p><p>请等待后台任务完成后再切换。</p>', '<button data-action="close-modal">取消</button><button class="primary" data-action="confirm-library">选择资料库目录</button>'),
  'confirm-library':async()=>{closeModal();if(await call('chooseLibrary')){view.materialId=null;view.undo=[];view.filter='all';view.search='';navigate('library');}},
  'save-settings':async()=>{const values={};for(const key of ['maxWorkers','timeout','retries','sleepMs'])values[key]=Number($('#setting-'+key).value);await call('settings',values);toast('下载参数已保存');},
});
registerFields({
  'default-export':async element=>{await call('settings',{exportMode:element.value});toast('默认获取方式已保存');},
  'auto-update-check':async element=>{
    const enabled=element.checked;element.disabled=true;
    try{await saveUpdatePreferences({autoCheck:enabled});toast(enabled?'已开启启动时自动检查更新':'已关闭自动检查，仍可在关于页手动检查');if(enabled&&state.packaged)void checkForUpdates();}
    catch(error){element.checked=updatePreferences().autoCheck;throw error;}
    finally{element.disabled=false;}
  },
});
