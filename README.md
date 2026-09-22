# 课页 · keye-desktop

课页的新一代 Windows 桌面项目。界面沿用稳定版的 HTML、CSS 和 JavaScript，并通过 TypeScript 桥接 Tauri 2 + Rust 核心；系统 WebView2 负责渲染。代码仓库为 [goooseby/keye-desktop](https://github.com/goooseby/keye-desktop)。

**当前是开发版本，还不是旧版的升级包。** 已接入资料库、课程与课次、图片和 PDF 导入、逐页筛选、单份及批量 PDF 导出、网页登录检测、课表扫描和课件下载。学校平台流程还需要使用者登录后实测；应用内更新与旧版资料库迁移尚未实现。

## 名称与边界

| 用途 | 名称 |
| --- | --- |
| 用户看到的应用名 | 课页 |
| 代码目录、GitHub 仓库、npm 包和 Rust 包 | `keye-desktop` |
| Tauri 应用标识 | `io.github.goooseby.keye.desktop` |
| 当前开发阶段 | 功能重写中的 `0.1.0`；不是旧版应用的升级包 |

这个标识特意与旧版分开。新项目不自动读取旧版资料，更不会在开发或验证中触及旧版安装数据。将来只通过用户主动选择的来源执行复制式迁移。

## 目录

```text
src/                  TypeScript 桥接代码
public/ui/            从稳定旧版迁入的界面、样式与交互
src-tauri/src/        Rust 资料库、PDF、学校平台和桌面命令
src-tauri/icons/      从现有课页 SVG 生成的桌面图标
public/               前端静态资源
scripts/              在项目内配置 Rust 路径的开发脚本
docs/                 需求、架构、数据迁移与开发环境说明
.toolchain/            项目专用 Rust 工具链，本地生成且不入库
.build/                Rust 构建产物与开发资料库，本地生成且不入库
.tools/pdfium/         PDF 渲染组件，本地下载且不入库
```

开发前请读 [开发环境](docs/DEVELOPMENT.md)。工具齐备后，在 PowerShell 中从项目目录运行：

```powershell
.\scripts\dev.ps1
```

开发脚本在项目内保存测试资料，不会访问旧版安装数据。初次启动会把 PDFium 下载到项目内 `.tools/pdfium/`；不安装 Windows 安装包。浏览器直接访问 Vite 页面不能调用桌面功能。

## 设计文档

- [产品需求与验收范围](docs/REQUIREMENTS.md)
- [架构与模块边界](docs/ARCHITECTURE.md)
- [迁移顺序与数据保护](docs/MIGRATION.md)
- [开发环境及清理方式](docs/DEVELOPMENT.md)

旧项目位于同级目录 `GetPPTApp`，作为功能行为的参考。两个项目分别开发、验证、发布；本项目不会沿用旧版的自动更新通道。
