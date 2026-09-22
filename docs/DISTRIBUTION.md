# Windows 分发方案（开发阶段）

当前开发版及本地测试安装包已构建成功，尚未完成安装、卸载和应用内更新的端到端验收。分发目标是一个 `课页_x.y.z_setup.exe`：双击后进入 Windows 安装向导，可选择安装目录。配置采用 Tauri 2 的 NSIS `currentUser` 模式，默认安装给当前用户，不要求管理员权限；选择其他位置时以 Windows 对目标目录的实际写入权限为准。应用运行时不依赖安装路径可写。

数据边界已经在代码中固定：开发脚本使用项目内 `.build/dev-data/`；普通运行使用 Tauri 的 `app_local_data_dir()`，即用户自己的 Local AppData 下按应用标识符命名的目录。SQLite 数据库、课件原图、预览、任务和设置均在资料库目录；用户可以在设置中切换资料库。安装目录只放程序和 PDFium 等只读资源，不放需要修改的课件数据。导出的 PDF 仍保存到用户选定的目录。安装、升级或更换安装位置不应重建资料库，也不应自动删除它。

当前已接入的基础设施：

- NSIS 安装配置、简体中文、Windows“已安装的应用”卸载登记及应用“关于”页卸载入口。卸载入口调用安装目录中的 `uninstall.exe`；源码开发版禁用。
- NSIS 卸载向导自带“删除应用数据”选择项。默认保留用户数据；勾选后清理默认 AppData 目录，不清理外置资料库或导出的 PDF。
- PDFium 随安装包作为只读资源放在程序目录，开发版仍从 `.tools/pdfium/` 读取。安装脚本会先校验 PDFium 下载包。
- Tauri 签名更新器已连接到本仓库 GitHub Releases 的 `latest.json`。检查、下载进度和启动安装由“关于”页控制。更新包必须由同一密钥签名；标准 Tauri 更新器下载完整安装包，**当前没有真正的二进制差分更新**。
- `scripts/package.ps1` 可制作 NSIS 安装包；`scripts/release-manifest.ps1` 根据安装包及签名生成 `latest.json`。这些脚本尚未代表安装、卸载和更新流程已验收。

正式发布前仍需要：

1. 当前更新策略是应用内自动下载、验签并安装完整包，以操作简单和失败可恢复为优先。若以后要节省下载流量，再实现有完整包兜底的差分机制；不能把当前完整更新标注为差分下载。
2. 安全备份本地 `.secrets/keye-updater.key` 和 `.secrets/keye-updater.password`。打包脚本从这两个文件读取签名信息；两者都被 Git 忽略，绝不能提交。私钥丢失后，已安装版本无法验证新签名。
3. 验证打包后的 PDFium 读取、WebView2 可用性、首次安装、关闭重开、默认及自选安装路径、Windows 设置中的卸载入口、应用内卸载入口、保留及删除默认数据、重装后找回数据。
4. 在实际 GitHub Release 上验证 `latest.json`、安装包和 `.sig` 的命名及 URL，并在两个版本之间验证检查、下载、签名、安装和失败处理。发布 Release 前不要将“关于”页的更新显示当作端到端验收。

默认 `bundle.active` 保持 `false`；只有 `scripts/package.ps1` 使用的专用配置将它设为 `true`。本地 `0.1.0` 测试安装包位于 `.build/cargo/release/bundle/nsis/`，实测体积 7.61 MiB。它的更新签名和 `latest.json` 已同时生成；尚未安装验收，也没有发布 Release。发布时须将安装包、同名 `.sig` 和 `latest.json` 一起作为同一版本 GitHub Release 的附件，版本标签为 `v<版本号>`。

参考：[Tauri Windows 安装包](https://v2.tauri.app/distribute/windows-installer/)、[Tauri NSIS 配置](https://v2.tauri.app/reference/config/#nsisinstallermode)、[Microsoft 的应用数据目录建议](https://learn.microsoft.com/en-us/windows/win32/dxtecharts/user-account-control-for-game-developers)。
