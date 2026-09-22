# 课页 · keye-desktop

课页是面向 Windows 的个人课件资料库：获取课程课件或导入本地文件，按课程和课次整理，逐页预览并排除无效页面，最后导出 PDF。桌面应用使用 Tauri 2、Rust、TypeScript 和系统 WebView2。代码仓库为 [goooseby/keye-desktop](https://github.com/goooseby/keye-desktop)。

当前版本是可运行的开发版，已接入资料库、课程与课次、图片和 PDF 导入、逐页筛选、单份及批量 PDF 导出、网页登录检测、课表扫描和课件下载。学校平台流程仍需使用者登录后实测；安装、卸载和应用内更新已接入基础设施，但尚未完成安装版验收。

## 项目信息

| 用途 | 名称 |
| --- | --- |
| 应用名 | 课页 |
| 仓库、npm 包和 Rust 包 | `keye-desktop` |
| Tauri 应用标识 | `io.github.goooseby.keye.desktop` |
| 当前版本 | `0.1.0` 开发版 |

## 目录

```text
src/                  TypeScript 桥接代码
public/ui/            界面、样式与交互
src-tauri/src/        Rust 资料库、PDF、学校平台和桌面命令
src-tauri/icons/      桌面图标
public/               前端静态资源
scripts/              开发、检查与构建脚本
docs/                 产品、架构和开发文档
.toolchain/            项目专用 Rust 工具链，本地生成且不入库
.build/                Rust 构建产物与开发资料库，本地生成且不入库
.tools/pdfium/         PDF 渲染组件，本地下载且不入库
```

开发前请读 [开发环境](docs/DEVELOPMENT.md)。工具齐备后，在 Windows PowerShell 中进入项目目录并运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev.ps1
```

开发脚本将测试资料存放在项目内 `.build/dev-data/`。初次启动会把 PDFium 下载到项目内 `.tools/pdfium/`。浏览器直接访问 Vite 页面不能调用桌面功能。

## 文档

- [产品需求与验收范围](docs/REQUIREMENTS.md)
- [架构与模块边界](docs/ARCHITECTURE.md)
- [本地资料与数据保护](docs/MIGRATION.md)
- [开发环境及清理方式](docs/DEVELOPMENT.md)
- [Windows 安装与数据目录方案](docs/DISTRIBUTION.md)

本地已能生成用于验收的 Windows 安装包，位置在 `.build/cargo/release/bundle/nsis/`。安装向导可选择安装目录；卸载时可选择是否删除默认应用数据，保留数据后重装可继续使用。分发与更新的验收项目见[分发方案](docs/DISTRIBUTION.md)。当前尚未发布 GitHub Release。
