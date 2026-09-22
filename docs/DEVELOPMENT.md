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

Tauri 的 `useLocalToolsDir` 已启用。日常开发默认不构建安装包；测试安装包由 `scripts/package.ps1` 显式生成。

仓库只保留 Windows 打包所需的 `icon.ico` 和源 SVG。Tauri 图标命令生成的 Android、iOS 等变体留在本地但不入库，需要扩展平台时可用 `npx tauri icon public/app-icon.svg` 重新生成。

`scripts/check.ps1` 执行前端构建与 Rust 编译检查。`scripts/build.ps1` 编译应用程序本体，不制作安装包；`scripts/package.ps1` 制作签名 NSIS 安装包和更新清单。安装、卸载与应用内更新仍需实机验收。

## 恢复和清理

开发阶段的测试资料**就在本项目** `.build/dev-data/`，重新编译不会清除。若只想清理缓存，关闭程序后可以删除 `.build/cargo/`、`dist/`、`node_modules/`；保留 `.build/dev-data/`。项目专用 Rust 位于 `.toolchain/`。Visual Studio Build Tools 请通过 Windows“已安装的应用”或 Visual Studio Installer 卸载，不手动删系统文件。

官方安装说明：[Tauri Windows 前置条件](https://v2.tauri.app/start/prerequisites/)、[Rustup](https://rustup.rs/)、[WebView2 分发](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/distribution)。
