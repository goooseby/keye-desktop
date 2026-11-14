# 新工作台业务接入

## 边界

沿用 `public/workbench/` 已确认的结构、样式、动效和多标签。禁止向旧页面套新外壳、覆盖旧渲染函数。旧 `index.html` 和 `public/ui/` 保留。真实入口 `workbench.html` 与示例入口 `/workbench/` 使用相同渲染文件；仅真实入口启动 Tauri 适配层。

## 数据与命令

| 界面 | 现有业务 |
| --- | --- |
| 课程、课件、设置 | `snapshot` / `snapshot-changed` |
| 页面画面 | 快照中的 `media.src` / `media.thumb`，不生成替代素材 |
| 排除、恢复、裁剪、撤销 | `pageState`，带课件 ID 和当前 revision；成功后同步快照 |
| 完成整理 | `reviewed`，带当前 revision |
| 上次页码 | `lastPage`，按文件 ID 保存 |
| 新课程、名称备注、回收站 | `saveCourse` / `materialNote` / `trash` |
| 导入、导出 | 原生文件选择 `import` / `export` / `batchExport` |
| 获取 | `login` / `logout` / `scan` / `download` |
| 后台任务 | `task-changed` 和 `task`，不因关闭标签停止 |
| 设置 | `settings` / `chooseExportDir` / `chooseLibrary` / `updatePreferences` |

## 保存规则

后端快照为业务事实来源；标签只持有页码、多选、筛选、滚动位置。保存前复制预期修改，不先改已保存对象；保存期间防止重复修改或关闭文档。调用失败保留选择、裁剪草稿和撤销历史；刷新后读回事实状态。不同资料库切换时清空旧标签与撤销记录。缺失原始页不可恢复、裁剪或导出为实际画面。

## 验证

v0.5.1 补充实际原生窗口关闭验证：`pwsh -NoProfile -File scripts/dev/test-workbench-live.ps1 -CloseOnly`。使用独立测试进程，验证保存阻止关闭、异步关闭与重复点击，最终点击真实标题栏关闭按钮，并确认该进程退出。原生关闭处理由 Tauri 的 `onCloseRequested` 完成销毁，因此主窗口能力中必须包含 `core:window:allow-destroy`；检查通过后直接交还默认关闭流程，不递归发起关闭。

1. 适配模型和错误路径的隔离测试；保留旧整理流程回归测试。
2. 前端构建与差异检查。
3. 真实开发资料库：读取真实图片，多文档隔离，排除/恢复/撤销/裁剪持久化，刷新读回。
4. 真实 PDF 输出与页数检查仅写项目内测试目录；文件选择取消不生成成功状态。
5. 桌面及窄窗口逐页截图检查，与已确认的工作台对照。
6. 登录、扫描等外部服务未实际运行时明确记录，不以模拟结果替代。

## 入口与复核命令

- 桌面默认入口为 `workbench.html`；`/workbench/` 仍为同一界面的示例预览；旧界面保留在 `/index.html`。
- `src/desktop.ts` 从原 `src/main.ts` 提取既有命令与更新服务，两个入口共用。课程管理扩展了 Rust 命令和事务；数据库表结构未改变，不需要迁移。
- `node --test scripts/dev/workbench-business.test.mjs scripts/dev/page-images.test.mjs scripts/dev/review-completion.test.mjs scripts/dev/update-policy.test.mjs scripts/dev/bulletin-policy.test.mjs scripts/dev/release-compatibility.test.mjs` 检查适配层、共用图片缓存、公告策略、改名兼容和原有业务规则，46 项通过。
- `pwsh -NoProfile -File scripts/check.ps1` 构建前端并检查 Rust 编译。
- 已运行开发版时，`pwsh -NoProfile -File scripts/dev/test-workbench-live.ps1` 建立独立 `.build/workbench-qa-*` 资料库、独立 WebView 配置和调试端口，验证真实写入、刷新读回、导出与四种尺寸。需要 Python 与 Pillow；测试不读取或修改安装用户资料。四个报告保留在 `.build/workbench-review/`：`live-report.json`、`polish-report.json`、`bulletins-report.json`、`course-report.json`。课程管理检查还实际关闭并重开隔离应用，验证待删除计划恢复。
- 多标签示例的 78 项交互检查通过；真实界面五个页面在 1440、1100、900、620 宽度检查；真实输出 PDF 为排除后的 3 页，裁剪后页面尺寸为 480 × 360。
- Rust 29 项单元测试通过，包括公告格式和已读持久化、删除期限、撤销、重启、原子回滚、并发页码更新及关联任务保护。学校账号登录、外网扫描下载、正式更新安装和原生文件选择窗口的人工操作未执行，不计为已验证；获取页自动检查使用隔离课表。

## 课程管理与删除

公告与版本更新共用 `bulletins.js` 窗口与调度，公告服务、本地状态和维护流程见 [ANNOUNCEMENTS.md](ANNOUNCEMENTS.md)。远程正文只做安全的文本排版，不渲染 HTML。检查更新仍走 `src/desktop.ts` 原签名更新器，服务器公告不能替代安装包地址或签名。

左侧课程行悬停或键盘定位时显示省略号，打开课程信息对话框。保存名称、学期不会改变课件归属。未归类是虚拟分组，不提供删除。

删除必须再次确认，默认将课件移至未归类，也可选择移入回收站。确认后持久化 8 秒待删除计划，界面隐藏该课程并显示撤销横条，期限内不改动任何课件。撤销与执行通过 SQLite 事务串行处理；到期才清空课件课程归属并删除课程记录。回收站模式设置软删除，保留原始文件、已导出 PDF、裁剪和排除记录。原已在回收站的课件不会被移出回收站。关闭应用不会丢失计划，重开时继续处理；执行失败保留计划并提示，仍可撤销。

待删除课程不能重命名或接收新课件；关联下载、导入任务未完成时拒绝删除。导入目标再次校验，课程分配整体事务提交，防止延迟操作重新创建已删除课程。切换资料库前必须完成或撤销待删除计划。

## 获取、设置与图片预览

获取页按课程标识分组，同名不同课程不合并。课程勾选仅涉及可获取课次，已获取及排队中课次禁选；分组展开状态和筛选状态保留。底部操作栏是滚动容器外的独立区域，防止列表从下方露出。设置采用最大宽度 620px 的紧凑面板，高级参数折叠，后台快照不覆盖未保存输入。

`public/shared/page-images.js` 为新旧界面共用的图片缓存与绘制核心，解码缓存上限 64MiB。网格、侧栏、大图都绘制已保存裁剪范围，只有裁剪编辑器显示原图。大图翻页保留同一画布，下一帧解码成功后才替换；请求标识阻止过期结果覆盖，预加载相邻页。选择复选框不重建网格。隔离测试校验三处裁剪像素、原图对照，以及 60 次快速翻页没有移除画布或透明度闪烁；这是本地验证，不代表所有设备的耗时上限。
