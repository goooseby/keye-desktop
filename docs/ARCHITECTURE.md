# 架构与模块边界

## 总体结构

```text
旧版界面 HTML/CSS/JS + TypeScript 命令桥接（WebView2）
       │ Tauri invoke / 事件
Rust 应用层
       ├─ commands.rs：桌面命令、对话框、运行状态和任务控制
       ├─ platform.rs：学校登录凭据解析、课表 API、课件下载
       ├─ library.rs：课程／课次／页面模型及 SQLite 持久化
       └─ pdf.rs：PDF 导入、预览、保真或合并导出
```

学校平台细节集中在 `platform.rs`，本地资料库不依赖登录状态。桌面命令通过 Tauri 的后台线程处理，变更以状态事件通知界面。预览图由限于资料库目录的自定义协议按需读取，状态快照只传元数据和预览地址。

## 登录与网络

网页登录使用单独的 WebView2 隐私窗口。后台线程检测该窗口的 Cookie，获得学校身份后自动扫描当前日期范围。HTTP 客户端绕开桌面代理并设置学校接口所需请求头。令牌只在运行时内存中使用，不写入课件数据库或前端日志；网络错误不得暴露含令牌的完整请求地址。学校登录和下载仍需账号持有人在真实网络中验收。

参考：[Tauri Cookie API](https://docs.rs/tauri/latest/tauri/webview/struct.Webview.html)、[WebView2 CookieManager](https://learn.microsoft.com/en-us/dotnet/api/microsoft.web.webview2.core.corewebview2cookiemanager.getcookiesasync)。

## 数据与文件

开发资料位于项目 `.build/dev-data/`，正式版本默认进入独立的用户应用数据目录；导出 PDF 使用用户指定目录。SQLite 存课程、课次、页面筛选、任务和设置，图片及 PDF 原件单独存放。预览和缩略图可由原件重建，不是唯一副本。PDF 先写临时文件，再替换目标；数据库用 `user_version` 拒绝未知的新版本。

为沿用成熟界面，新版暂保持旧版的课程、课次和设置字段语义，但资料库独立创建，也拒绝直接打开旧版更高版本的数据库。旧数据复制迁移见 [MIGRATION.md](MIGRATION.md)。

## 性能与稳定性

- 页面图片按需读取；快速翻页沿用界面已有的过期请求取消和相邻页面预取。
- 文件下载在后台线程执行，有暂停、取消和重试；PDF 操作用互斥锁保护 PDFium。进一步优化下载并发和大资料库列表性能仍待实测。
- 浏览器进程失败可报告并恢复；不要把“系统 WebView2”视为完全不会卡顿的保证。
- 正式发布时复用系统共享的 Evergreen WebView2；开发阶段无需安装包。

## 更新与安全

应用内自动更新尚未迁移。待正式分发时，新项目需使用自己的 GitHub Release、更新清单和签名密钥，且与旧版通道隔离。对远端学校网页不授予 Tauri 命令权限；登录窗口与本地应用窗口分离。

参考：[Tauri 更新插件](https://v2.tauri.app/plugin/updater/)、[WebView2 分发](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/distribution)。
