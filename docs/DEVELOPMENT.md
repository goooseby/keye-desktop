# 开发环境与清理方式

## 需要的工具

| 工具 | 用途 | 安装位置／方式 |
| --- | --- | --- |
| Node.js 与 npm | TypeScript、Vite 和 Tauri CLI | 使用本机已有的 Node.js，不额外安装一套；项目 `.npmrc` 使用 npm 官方仓库 |
| Git | 版本管理 | 使用本机已有的 Git |
| Rustup + Rust MSVC 工具链 | 编译 Rust 核心 | 本项目 `.toolchain/`，由脚本临时加入当前进程 PATH |
| Visual Studio 2022 Build Tools 的 C++ 工作负载 | Windows 原生链接与 SDK | 微软标准安装器管理，系统级唯一一套 |
| WebView2 Evergreen Runtime | 界面渲染 | Windows 11 通常自带 |
| PDFium | 本地 PDF 预览与保真导出 | 开发脚本从固定版本下载到项目 `.tools/pdfium/`，校验 SHA-256 |

不需要单独安装 Python、Qt、Chromium 或全局 npm 包。`.toolchain/`、`.build/`、`node_modules/`、`dist/` 都被 Git 忽略。项目脚本仅修改当前 PowerShell 进程的环境变量；关闭窗口后不改变系统 PATH。

## 本机启动

```powershell
cd <克隆仓库所在目录>\keye-desktop
npm ci
.\scripts\dev.ps1
```

`scripts/env.ps1` 指定 Rust 工具链、构建目录、项目内开发资料库和 PDFium 路径。直接在普通命令行运行 `cargo` 可能找不到项目内工具链，这是有意设计；请经项目脚本运行。首次 Rust 构建会下载依赖，耗时和磁盘占用可能较大；缓存与构建产物都留在项目目录。开发资料位于 `.build/dev-data/`，**清理构建缓存时不要删除这里**。

开发启动会先构建前端，再用本地静态服务打开窗口，避免窗口显示后临时编译前端造成长时间的“正在打开资料库”。修改前端代码后需重启开发程序才能看到变化。首次或 Rust 依赖变更后的编译仍可能较久，但发生在窗口出现之前。开发配置单独优化了图片处理依赖，便于测试大量页面的导入。

Rust 开发构建使用 `debug = 1`（有限调试信息），以减少完整调试符号的磁盘占用；Windows MSVC 默认将调试信息放在独立的 PDB 文件中，不设置该平台不支持的 `split-debuginfo = "unpacked"`。首次切换编译配置时 Cargo 可能重编部分依赖，之后继续复用新配置的缓存。既有 `.build/cargo/debug/` 产物不会自动删除；只清理 PDB 也可能让 Cargo 重新生成相应产物，不能保证完全没有编译开销。

Tauri 的 `useLocalToolsDir` 已启用。日常开发默认不构建安装包；测试安装包由 `scripts/package.ps1` 显式生成。

仓库只保留 Windows 打包所需的 `icon.ico` 和源 SVG。Tauri 图标命令生成的 Android、iOS 等变体留在本地但不入库，需要扩展平台时可用 `npx tauri icon public/app-icon.svg` 重新生成。

`scripts/check.ps1` 执行前端构建与 Rust 编译检查。`scripts/build.ps1` 编译应用程序本体，不制作安装包；`scripts/package.ps1` 制作签名 NSIS 安装包和更新清单。安装、卸载与应用内更新仍需实机验收。

## 恢复和清理

下载诊断日志位于当前资料库的 `logs/downloads.jsonl`；默认开发版对应项目内 `.build/dev-data/logs/downloads.jsonl`。每次图片请求记录任务、页码、尝试次数、HTTP 状态、响应类型、字节数、耗时和失败阶段。日志不记录账号凭据、完整资源网址或响应正文；超过 4 MiB 时轮换，仅保留当前文件和一份历史文件。任务临时文件清理不会删除诊断日志。记录失败不阻断下载，可从开发启动的错误输出确认日志写入情况。

正式构建只保留失败请求和缺页事件，不写入逐页成功日志。`#[cfg(test)]` 测试代码不会进入正式程序，`scripts/dev/` 与 `scripts/inspect.ps1` 不属于安装包资源；远程调试端口只由显式的开发启动脚本开启。开发构建的数据默认回落到项目内目录，正式构建忽略 `KEYE_DEV_DATA_DIR`，防止环境变量混淆两种数据位置。

下载容错回归测试：加载 `scripts/env.ps1` 后执行 `cargo test --manifest-path src-tauri/Cargo.toml --locked --lib`。平台测试使用本地 HTTP 模拟服务重现第 30 页返回 HTTP 200、JPEG 类型但 0 字节的场景，检查另外 39 页继续下载；资料库测试检查 39 页连续页序、39 页 PDF 导出，以及已有缺失空位迁移后排除、裁剪、阅读位置保留和重复打开的幂等性。

开发阶段的测试资料**就在本项目** `.build/dev-data/`，重新编译不会清除。若只想清理缓存，关闭程序后可以删除 `.build/cargo/`、`dist/`、`node_modules/`；保留 `.build/dev-data/`。项目专用 Rust 位于 `.toolchain/`。Visual Studio Build Tools 请通过 Windows“已安装的应用”或 Visual Studio Installer 卸载，不手动删系统文件。

官方安装说明：[Tauri Windows 前置条件](https://v2.tauri.app/start/prerequisites/)、[Rustup](https://rustup.rs/)、[WebView2 分发](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/distribution)。

## 界面回归脚本

`scripts/dev/` 下的脚本通过 WebView2 调试端口驱动正在运行的开发版，检查容易回归的界面行为，输出 JSON 断言：

```powershell
.\scripts\inspect.ps1                  # 带调试端口（9222）启动开发版
node scripts\dev\check-pages.mjs       # 逐页冒烟：资料库三个状态、课程页、整理页、浮层、导出与帮助
node scripts\dev\check-navigation.mjs  # 翻页范围与浮层置灰
node scripts\dev\check-crop.mjs        # 裁剪落库、呈现同步、还原、撤销、批量应用
node scripts\dev\check-crop-ui.mjs     # 裁剪模式纯度与勾选不丢
node scripts\dev\check-crop-flicker.mjs# 勾选时已裁剪缩略图不闪回原图
```

脚本只读取界面状态，不改资料库；`check-crop` 不执行真实导出（导出尺寸由 `cargo test` 的 PDF 测试断言）。界面模块划分与改动约定见 [ARCHITECTURE.md](ARCHITECTURE.md#界面结构)。

更新策略无需运行窗口即可回归：`node --test scripts/dev/update-policy.test.mjs` 覆盖忽略版本、24 小时提醒、`NEW` 常驻与直达日志、并发检查、离线、开发版禁用和安装前任务保护；它使用模拟更新结果，不发布版本、不访问正式更新源、不执行安装。Rust 的 `updates::tests` 验证偏好持久化与资料库配置互不影响。
