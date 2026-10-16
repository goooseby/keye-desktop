'use strict';

// 关于页：版本信息、更新检查与下载安装、项目链接。

function renderAbout(){
  main.innerHTML=`<section class="about-hero"><div class="about-mark"><img src="/app-icon.svg" alt="课页图标"></div><div class="about-intro"><div class="eyebrow">ABOUT KEYE</div><h1>课页 <span>KEYE</span></h1><p>把课堂课件的获取、筛选和 PDF 导出，整理成一条清楚、安静的工作流。</p><div class="about-actions"><span class="about-version">当前版本 v${esc(state.appVersion||'0.1.1')}</span><button class="secondary" data-action="show-help">${icon('help')}查看使用说明</button></div></div><div class="about-decoration" aria-hidden="true"><i></i><i></i><i></i></div></section>
    <div class="about-grid"><section class="panel about-card"><div class="about-card-icon">${icon('database')}</div><h2>资料留在本机</h2><p>课程、原始页面、筛选记录和设置保存在本地资料库中。排除页面不会删除原始素材。</p></section><section class="panel about-card"><div class="about-card-icon">${icon('school')}</div><h2>服务课堂资料</h2><p>面向华南理工大学课堂课件平台，也支持导入已有图片、PDF 和课件目录。</p></section><section class="panel about-card"><div class="about-card-icon">${icon('export')}</div><h2>自由整理与导出</h2><p>可以直接快速导出，也可以逐页预览、排除无关画面，再生成更干净的 PDF。</p></section></div>
    <div class="about-maintenance"><section class="panel about-update"><div class="about-maintenance-head"><div class="about-update-icon">${icon('download')}</div><div><div class="eyebrow">UPDATE</div><h2>更新与安装</h2></div></div><div class="about-update-copy"><p id="update-status" role="status"></p><div id="update-notes"></div><div class="update-meter" id="update-meter" hidden><span id="update-meter-fill"></span></div></div><div class="about-update-actions"><button data-action="check-update" ${state.packaged?'':'disabled'}>检查更新</button><button class="secondary" data-action="download-update" hidden>下载更新</button><button class="primary" data-action="install-update" hidden>重启并安装</button><button class="quiet" data-action="open-release">查看正式版本 ${icon('arrow')}</button></div></section>
    <section class="panel about-uninstall"><div class="about-maintenance-head"><div class="about-uninstall-icon">${icon('settings')}</div><div><div class="eyebrow">UNINSTALL</div><h2>卸载应用</h2></div></div><p>卸载向导可选择保留或删除默认应用数据。单独选定的资料库目录及已导出的 PDF 不会随程序卸载。</p><div class="about-uninstall-actions"><button class="secondary" data-action="uninstall" ${state.packaged?'':'disabled'}>打开卸载向导</button></div></section></div>
    <section class="panel about-details"><div><div class="eyebrow">PROJECT INFORMATION</div><h2>项目与作者</h2><p class="about-details-intro">课页是一个开源的个人课件整理工具，欢迎查看源码与后续更新。</p></div><dl><div><dt>应用名称</dt><dd>课页 · Keye</dd></div><div><dt>当前版本</dt><dd>v${esc(state.appVersion||'0.1.1')}</dd></div><div><dt>作者</dt><dd><button class="about-link" data-action="open-author">goooseby ${icon('arrow')}</button></dd></div><div><dt>项目仓库</dt><dd><button class="about-link" data-action="open-repository">goooseby/keye-desktop ${icon('arrow')}</button></dd></div></dl><p class="about-note">适用于 Windows 10 / 11。账号凭据仅在当前运行中使用，不会写入课件数据库。</p></section>`;
  renderUpdateStatus();
}
function renderUpdateStatus(){
  const status=$('#update-status');if(!status)return;
  const info=updateState.info;
  status.textContent=updateState.error||(!state.packaged?'源码运行中；安装与自动更新仅适用于安装版。':updateState.checking?'正在检查 GitHub Releases…':updateState.downloading?`正在下载并校验更新${updateState.progress?`：${updateState.progress}%`:'…'}`:updateState.ready?'下载和校验已完成，可以安装更新。':info?.manual?info.manualReason||'请在 GitHub 下载完整包。':info?.available?`发现 v${info.latest} · 完整更新${info.size?` · ${(info.size/1024/1024).toFixed(1)} MB`:''}`:info?'当前已是最新正式版本。':'点击检查更新，课页会从 GitHub 获取最新正式版本。');
  const notes=$('#update-notes');
  notes.textContent=info?.available&&info.notes?info.notes:'';
  notes.hidden=!notes.textContent;
  const meter=$('#update-meter');meter.hidden=!updateState.downloading;
  $('#update-meter-fill').style.width=updateState.progress+'%';
  $('[data-action="check-update"]').disabled=!state.packaged||updateState.checking||updateState.downloading;
  $('[data-action="download-update"]').hidden=!(info?.available&&!info.manual&&!updateState.downloading&&!updateState.ready);
  $('[data-action="install-update"]').hidden=!updateState.ready;
}

// —— 关于页的动作注册（更新检查与安装） ——
registerActions({
  'check-update':async()=>{updateState.checking=true;updateState.info=null;updateState.ready=false;updateState.error='';renderUpdateStatus();try{updateState.info=await call('checkUpdate');}catch(error){updateState.error=error.message;}finally{updateState.checking=false;renderUpdateStatus();}},
  'download-update':async()=>{updateState.downloading=true;updateState.progress=0;updateState.error='';renderUpdateStatus();try{await call('downloadUpdate');updateState.ready=true;}catch(error){updateState.error=error.message;}finally{updateState.downloading=false;renderUpdateStatus();}},
  'install-update':()=>call('installUpdate'),
  'open-release':()=>call('openRelease'),
  'open-author':()=>call('openAuthor'),
  'open-repository':()=>call('openRepository'),
  uninstall:()=>call('uninstall'),
});
