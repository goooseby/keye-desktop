# 架构与模块边界

## 总体结构

```text
HTML/CSS/JS 界面 + TypeScript 命令桥接（WebView2）
       │ Tauri invoke / 事件
Rust 应用层
       ├─ commands.rs：桌面命令、对话框、运行状态和任务控制
       ├─ platform.rs：学校登录凭据解析、课表 API、课件下载
       ├─ library.rs：课程／课次／页面模型及 SQLite 持久化
       └─ pdf.rs：PDF 导入、预览、保真或合并导出
```

学校平台细节集中在 `platform.rs`，本地资料库不依赖登录状态。桌面命令通过 Tauri 的后台线程处理，变更以状态事件通知界面。预览图由限于资料库目录的自定义协议按需读取，状态快照只传元数据和预览地址。

## 界面结构

界面是经典脚本（不经过打包器），按依赖顺序加载，每个文件只承担一件事：

```text
public/ui/
├─ dom.js       图标、转义、空状态（不依赖任何状态）
├─ state.js     快照数据、视图状态、派生选择器，“整理 / 导出”的唯一口径
├─ media.js     页面图像标记与裁剪显示换算
├─ updates.js   启动更新检查、提醒策略、品牌标记与更新对话框
├─ actions.js   动作与表单的注册表及分发
├─ covers.js    课程封面绘制
├─ pages/       一个页面一个文件：library / course / editor / crop / acquire / tasks / about / settings
└─ app.js       外壳：启动、快照、导航与渲染分发、模态与提示、全局事件入口
```

改动界面时遵循这些约定：

- **一个页面一个文件**：页面自己拥有它的渲染、动作与表单响应；跨页面的能力（导航、模态、提示、动作分发）只在 `app.js`。
- **动作要注册，不要再加分支链**：页面对自己响应的按钮（`data-action`）、点击（`data-*`）和表单（元素 `id`）调用 `registerActions` / `registerDataHandlers` / `registerDataChanges` / `registerFields` 声明，`app.js` 只按名字分发。
- **状态只有一个来源**：视图状态集中在 `state.js` 的 `view`，派生口径（如 `reviewed`、`exportBadge`）也只写在 `state.js`；页面不得自建平行的判断标准。资料库的 `filter` 只有 `all` / `pending` / `trash` 三个合法值，进入页面时归一化，不保留无人渲染的中间值——回收站是同一套列表的一个状态，不是另一套页面。
- **加载期不要调用后加载文件里的函数**：函数声明会提升，但跨文件的绑定要到对应脚本执行之后才存在；页面模块只在注册表达式和事件回调里引用其他模块，外壳级接线（如窗口按钮）留在 `app.js`。
- **样式分三层**：`styles.css` 基础、`refresh.css` 细化、`library-home.css` 资料库页局部；新增样式放进已有层，不再叠加新的覆盖层。

## 登录与网络

网页登录使用单独的 WebView2 隐私窗口。窗口上方提供平台首页、刷新网页和立即检测的手动控件；后台线程持续检测该窗口的 Cookie，获得学校身份后自动关闭窗口并扫描当前日期范围。HTTP 客户端绕开桌面代理并设置学校接口所需请求头。令牌只在运行时内存中使用，不写入课件数据库或前端日志；网络错误不得暴露含令牌的完整请求地址。学校登录和下载仍需账号持有人在真实网络中验收。

参考：[Tauri Cookie API](https://docs.rs/tauri/latest/tauri/webview/struct.Webview.html)、[WebView2 CookieManager](https://learn.microsoft.com/en-us/dotnet/api/microsoft.web.webview2.core.corewebview2cookiemanager.getcookiesasync)。

## 数据与文件

开发资料位于项目 `.build/dev-data/`，正式版本默认进入独立的用户应用数据目录；导出 PDF 使用用户指定目录。SQLite 存课程、课次、页面筛选、任务和设置，图片及 PDF 原件单独存放。预览和缩略图可由原件重建，不是唯一副本。PDF 先写临时文件，再替换目标；数据库用 `user_version` 拒绝未知的新版本。

数据库使用版本标记；遇到未知的较新格式时拒绝写入，避免破坏资料。资料位置和导入原则见 [MIGRATION.md](MIGRATION.md)。

## 性能与稳定性

- 大图与侧栏共用稳定的 Canvas 像素表面：图片加载成功后一次性绘制，不复用可见 img 的 src，不依赖异步 CSS 裁剪显隐。翻页期间保留上一帧并显示加载状态，过期结果不得覆盖当前页。解码图片按 64 MiB 预算缓存，相邻页预取复用同一请求；读取超时自动重试，失败提供点击重试。自定义图片协议在后台线程读取文件和查询数据库，避免阻塞窗口。
- `node --test scripts/dev/preview-loading.test.mjs` 覆盖像素提交、旧帧保留、过期请求、缓存往返、裁剪坐标、读取超时及重试、窗口关闭和缓存预算；无需读取用户资料库。
- 一次选中的课次先全部入队，每份课件各有任务记录；同时下载课件数可设为 1–4，默认 2，同一份课件的图片仍按页顺序获取。任务可暂停、取消和重试；PDF 操作用互斥锁保护 PDFium。大量课次并发时的表现仍待实测。
- 单页资源重试后仍不可用时继续下载，任务页记录缺失原页码与原因。资料库仅包含成功页面，页码连续，整理、预览、导出均不出现缺失占位。已有逻辑空位在打开资料库时事务性压缩，同时转换排除、裁剪和上次页码；保留原始文件和下载诊断。全部页面不可用、取消或本地写入失败仍作为任务失败处理。
- 浏览器进程失败可报告并恢复；不要把“系统 WebView2”视为完全不会卡顿的保证。
- 正式发布时复用系统共享的 Evergreen WebView2；开发阶段无需安装包。

## 更新与安全

“关于”页通过 Tauri 签名更新器检查 GitHub Release 清单，下载签名安装包并启动安装。发布前仍须用两个已签名版本验证整个流程。Tauri 官方更新器下载完整安装包；真正的差分下载需要另行设计和验证补丁机制，界面当前明确写作“完整更新”。对远端学校网页不授予 Tauri 命令权限；登录窗口与本地应用窗口分离。

自动与手动检查共用一条请求；已下载或下载中的更新不会被新检查释放。`updates.js` 管理提醒：忽略只抑制同版本自动弹窗，`NEW` 的可见性只取决于是否发现更新；手动点击标记始终直达更新对话框。启动提示等待当前对话框和编辑操作结束。提醒偏好由 Rust `updates.rs` 保存在应用根目录，课程资料库切换不影响它。

参考：[Tauri 更新插件](https://v2.tauri.app/plugin/updater/)、[WebView2 分发](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/distribution)。
