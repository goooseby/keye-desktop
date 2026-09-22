<p align="center"><img src="public/app-icon.svg" width="92" alt="课页图标"></p>

<h1 align="center">课页 · Keye</h1>

<p align="center">获取课件、筛选页面、导出 PDF，把课堂资料收进自己的资料库。</p>

<p align="center"><a href="https://github.com/goooseby/keye-desktop/releases/latest"><strong>下载 Windows 安装包</strong></a>　·　<a href="docs/DEVELOPMENT.md">从源码运行</a>　·　<a href="docs/DISTRIBUTION.md">安装与数据说明</a></p>

---

课页是一款面向 Windows 的个人课件整理工具。它可以按课程和课次收纳从华南理工大学课堂平台获取的课件，也支持导入本地图片与 PDF。逐页预览后，排除无关页面，再导出需要的内容；原始资料始终保留，之后还能继续调整。

## 界面预览

下列截图使用示例课程和示例页面，不包含真实账号或课件内容。

**资料库** · 课程、待整理数量和最近课件集中在一个页面。

![课页资料库：课程列表与继续整理](docs/screenshots/library.png)

**课程课次** · 按上课日期查看课件，支持单份快速导出与批量操作。

![课页课程页：按课次整理课件](docs/screenshots/course.png)

**逐页整理** · 同时查看缩略图和大图，排除、恢复或批量选择页面。

![课页整理页：缩略图、页面筛选与大图预览](docs/screenshots/editor.png)

## 可以做什么

- **获取课程资料**：在独立窗口登录学校平台，选择日期范围后自动扫描课表；下载任务按课件分别显示。
- **导入已有文件**：导入图片、PDF 或课件目录，按课程和课次整理。
- **筛选页面**：浏览缩略图与大图，使用 `E` 排除或恢复当前页、方向键翻页、`Shift` 连选，并可撤销操作。
- **灵活导出**：无需先标记“已整理”，就能快速导出单份或多份课件；首次导出时选择保存目录。
- **保留自己的资料**：课程、原始页面和整理记录存于本地，升级程序不会清空资料库。

## 安装与更新

从 [GitHub Releases](https://github.com/goooseby/keye-desktop/releases/latest) 下载 `课页_*_x64-setup.exe`，运行安装向导即可选择安装位置。课页使用 Windows 当前用户的数据目录保存资料；程序安装目录不存放课件。卸载可从 Windows“已安装的应用”或程序“关于”页启动，卸载向导允许选择保留或删除默认应用数据。自己另选的资料库目录和已经导出的 PDF 不会由卸载器删除。

“关于”页提供应用内更新：检查 GitHub Release、下载签名更新包并安装。当前采用完整安装包更新，操作无需手动替换文件；未来若加入差分下载，也会保留完整包作为后备。更多细节见 [Windows 分发说明](docs/DISTRIBUTION.md)。

## 开发

桌面端基于 **Tauri 2 + Rust + TypeScript + 系统 WebView2**。Windows 开发环境和项目内工具链说明见 [开发环境文档](docs/DEVELOPMENT.md)。工具齐备后，在仓库目录运行：

```powershell
npm ci
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev.ps1
```

开发资料保存在项目内 `.build/dev-data/`，与安装版的用户资料分开。浏览器直接打开前端页面无法调用桌面功能。

项目结构与行为约定另见 [产品需求](docs/REQUIREMENTS.md)、[架构说明](docs/ARCHITECTURE.md)和[数据保护](docs/MIGRATION.md)。
