# 课页 · keye-desktop

课页的新一代 Windows 桌面项目。界面使用 TypeScript + Vite，桌面外壳与业务核心使用 Tauri 2 + Rust，网页由系统 WebView2 渲染。

**当前是架构样机，不是旧版的替代品。** 目前只有独立窗口、界面导航和前后端连接检查；校园登录、扫描、下载、资料库、PDF 整理和更新尚未迁移。请继续使用旧版完成实际课件工作。

## 名称与边界

| 用途 | 名称 |
| --- | --- |
| 用户看到的应用名 | 课页 |
| 代码目录、GitHub 仓库、npm 包和 Rust 包 | `keye-desktop` |
| Tauri 应用标识 | `io.github.goooseby.keye.desktop` |
| 当前开发阶段 | 架构样机，版本 `0.1.0`；不是旧版应用的升级包 |

这个标识特意与旧版分开。新项目不自动读取旧版资料，更不会在开发或验证中触及旧版安装数据。将来只通过用户主动选择的来源执行复制式迁移。

## 目录

```text
src/                  WebView2 内的界面代码
src-tauri/src/        Rust 桌面入口与命令；业务模块将逐步加入
src-tauri/icons/      从现有课页 SVG 生成的桌面图标
public/               前端静态资源
scripts/              在项目内配置 Rust 路径的开发脚本
docs/                 需求、架构、数据迁移与开发环境说明
.toolchain/            项目专用 Rust 工具链，本地生成且不入库
.build/                Rust 构建产物，本地生成且不入库
```

开发前请读 [开发环境](docs/DEVELOPMENT.md)。工具齐备后，在 PowerShell 中从项目目录运行：

```powershell
.\scripts\check.ps1
.\scripts\dev.ps1
```

只查看前端样机可运行 `npm run dev`。此时“桌面核心连接”显示浏览器预览，不能代替桌面程序验证。

## 设计文档

- [产品需求与验收范围](docs/REQUIREMENTS.md)
- [架构与模块边界](docs/ARCHITECTURE.md)
- [迁移顺序与数据保护](docs/MIGRATION.md)
- [开发环境及清理方式](docs/DEVELOPMENT.md)

旧项目位于同级目录 `GetPPTApp`，作为功能行为的参考。两个项目分别开发、验证、发布；本项目不会沿用旧版的自动更新通道。
