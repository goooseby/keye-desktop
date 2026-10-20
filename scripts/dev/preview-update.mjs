// Developer-only visual fixture. Requires scripts/inspect.ps1 / port 9222.
// Uses the real dialog and reminder preferences, but never downloads or installs.
import {evaluate} from './cdp.mjs';

console.log(await evaluate(String.raw`(() => {
  if(state.packaged)throw Error('仅允许在开发版预览更新交互。');
  if(modal.open)throw Error('请先关闭当前对话框，再启动更新预览。');
  const version='0.2.1-preview';
  if(!window.keyeUpdatePreview){
    const original=renderUpdateDialogStatus;
    renderUpdateDialogStatus=()=>{
      original();
      if(!modal.open||modal.dataset.updateVersion!==version)return;
      $('#modal-content .modal-header h2').textContent='更新提醒演示（不会下载安装）';
      $('[data-update-dialog-download]').disabled=true;
      $('[data-update-dialog-download]').textContent='演示模式 · 不下载';
      $('[data-update-dialog-install]').hidden=true;
      $('#update-dialog-status').textContent='这是开发版模拟的新版本，可测试忽略、稍后提醒以及 NEW 常驻和再次打开。';
    };
    window.keyeUpdatePreview=true;
  }
  updateState.info={available:true,latest:version,size:8*1024*1024,notes:'# 更新交互预览\n\n- 新版本提示与更新日志展示。\n- 忽略此版本后，NEW 仍然保留并可再次点击。\n- 稍后提醒延后 24 小时。\n\n**此版本为模拟数据，不会下载或安装。**'};
  updateState.error='';updateState.ready=false;updateState.downloading=false;
  syncUpdateBadge();showUpdateDialog();
  return {preview:true,version,downloadsEnabled:false};
})()`));
