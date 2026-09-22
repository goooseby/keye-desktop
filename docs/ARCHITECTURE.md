# 架构与模块边界

## 总体结构

```text
TypeScript 界面（WebView2）
       │ Tauri invoke / 事件
Rust 应用层：任务调度、状态转换、错误报告
       ├─ platform：网页登录窗口、Cookie、文件选择、系统路径
       ├─ provider：学校课表和课件 API 适配器
       ├─ library：课程／课次／页面模型及 SQLite 持久化
       ├─ media：图片解码、缩略图、PDF 导入与导出
       └─ update：GitHub 更新检查与签名验证
```

当前代码只有 `app_status` 命令，后续模块需按纵向功能逐步实现，不提前造一批空接口。学校平台细节只存在于 `provider`，以便未来变动不影响资料库和整理界面。所有耗时工作进入后台任务；界面只接收小型状态消息和当前可见页面所需图像，不一次性加载整门课程的所有原图。

## 登录与网络

网页登录使用单独的 WebView2 窗口及持久浏览器配置。Rust 侧读取需要的 Cookie；不能依赖网页 `document.cookie` 获取 HTTP-only 值。Tauri 当前 API 文档提醒，Windows 上在同步命令或事件处理器中读 Cookie 可能死锁，因此读取必须走异步命令／独立任务。HTTP 客户端与网页登录视图的状态交接要有单独测试，并确认学校 API 的代理、Referer、Origin 和授权头行为。令牌只在运行时内存中使用，不写入课件数据库或前端日志。

参考：[Tauri Cookie API](https://docs.rs/tauri/latest/tauri/webview/struct.Webview.html)、[WebView2 CookieManager](https://learn.microsoft.com/en-us/dotnet/api/microsoft.web.webview2.core.corewebview2cookiemanager.getcookiesasync)。

## 数据与文件

安装目录只放程序；应用数据进入独立的用户数据目录，导出 PDF 使用用户指定目录。数据模型至少包含课程、课次、页面、筛选状态、后台任务、导出记录和设置。数据库存元数据与相对路径，原始图片／PDF 独立存放；缩略图可重建，不应成为唯一副本。写入采用临时文件加原子替换，数据库结构使用版本化迁移。用户可以备份整个资料库目录。

旧版 SQLite 目前用 `materials`、`courses`、`tasks`、`settings` 表存 JSON；新模型不应盲目照搬。迁移过程另见 [MIGRATION.md](MIGRATION.md)。

## 性能与稳定性

- 图片按需解码，列表虚拟化；快速翻页时取消过期请求，只保留当前页和邻近页的预取。
- PDF 合成与文件下载有并发上限和明确取消、重试机制；不要在 UI 线程做同步磁盘或网络操作。
- 浏览器进程失败可报告并恢复；不要把“系统 WebView2”视为完全不会卡顿的保证。
- 发布时使用系统共享的 Evergreen WebView2，安装器检查缺失情况；离线版是否附带运行时由发行策略决定。

## 更新与安全

新项目使用自己的 GitHub Release 和更新清单，与旧版更新索引隔离。Tauri 官方更新插件要求安装包签名，并支持 GitHub Releases 中的静态 JSON；只有完成迁移和安装测试后才启用自动更新。私钥不放入仓库。对远端网页不授予 Tauri 命令权限；登录窗口和本地应用窗口须分离。当前样机的权限只允许默认窗口能力。

参考：[Tauri 更新插件](https://v2.tauri.app/plugin/updater/)、[WebView2 分发](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/distribution)。
