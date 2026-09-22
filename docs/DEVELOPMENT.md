# 开发环境与清理方式

## 需要的工具

| 工具 | 用途 | 安装位置／方式 |
| --- | --- | --- |
| Node.js 与 npm | TypeScript、Vite 和 Tauri CLI | 使用本机已有的 Node.js，不额外安装一套；项目 `.npmrc` 使用 npm 官方仓库 |
| Git | 版本管理 | 使用本机已有的 Git |
| Rustup + Rust MSVC 工具链 | 编译 Rust 核心 | 本项目 `.toolchain/`，由脚本临时加入当前进程 PATH |
| Visual Studio 2022 Build Tools 的 C++ 工作负载 | Windows 原生链接与 SDK | 微软标准安装器管理，系统级唯一一套 |
| WebView2 Evergreen Runtime | 界面渲染 | Windows 11 通常自带；正式安装包会检查缺失情况 |

不需要单独安装 Python、Qt、Chromium 或全局 npm 包。`.toolchain/`、`.build/`、`node_modules/`、`dist/` 都被 Git 忽略。项目脚本仅修改当前 PowerShell 进程的环境变量；关闭窗口后不改变系统 PATH。

## 本机启动

```powershell
cd D:\pythonDev\PythonProject\keye-desktop
npm ci
.\scripts\check.ps1
.\scripts\dev.ps1
```

`scripts/env.ps1` 指定 `RUSTUP_HOME`、`CARGO_HOME`、`CARGO_TARGET_DIR`。直接在普通命令行运行 `cargo` 可能找不到项目内工具链，这是有意设计；请经项目脚本运行。首次 Rust 构建会下载依赖，耗时和磁盘占用可能较大；缓存与构建产物都留在项目目录。

仓库只保留 Windows 打包所需的 `icon.ico` 和源 SVG。Tauri 图标命令生成的 Android、iOS 等变体留在本地但不入库，需要扩展平台时可用 `npx tauri icon public/app-icon.svg` 重新生成。

生成 Windows 安装包时运行 `.\scripts\build.ps1`。当前 `0.1.0` 是样机，不应当分发为可替代旧版的程序。

## 恢复和清理

用户资料不会放在代码目录。若只想清除本项目的开发缓存，关闭运行中的程序后删除项目内 `.build/`、`dist/`、`node_modules/`；要移除项目专用 Rust，再删除 `.toolchain/`。Visual Studio Build Tools 请通过 Windows“已安装的应用”或 Visual Studio Installer 卸载，不手动删系统文件。

官方安装说明：[Tauri Windows 前置条件](https://v2.tauri.app/start/prerequisites/)、[Rustup](https://rustup.rs/)、[WebView2 分发](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/distribution)。
