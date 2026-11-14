# 公告与更新

Windows 公告地址为 `https://keye.kovra.top/desktop/announcements.json`。服务器为 `8.138.204.47`，文件位于 `/var/www/keye/desktop/announcements.json`，由 Nginx 精确路由提供，与网站部署目录分离。安卓原有 `/announcements.json` 保持不变。

## 维护公告

编辑仓库中的 [desktop.json](../announcements/desktop.json)，然后运行：

```pwsh
pwsh -NoProfile -File scripts/publish-announcements.ps1
```

脚本先校验格式，再通过 SSH 密钥连接服务器，上传临时文件后原子替换，并校验线上内容 SHA-256；不需要重发安装包，不需要数据库或管理后台。服务器凭据不写入仓库。撤下公告时删除对应条目；清空数组表示暂无公告。公网读取只有公告本身，不接收账号或阅读记录。

每份文件最多 50 条、256 KiB。字段与安卓公告格式相似，Windows 版本筛选使用 `minVersion` / `maxVersion`，值为 `x.y.z`。

| 字段 | 说明 |
| --- | --- |
| `id` | 唯一编号，1–80 个英文字母、数字、连字符或下划线 |
| `revision` | 正整数，默认 1；需重新提醒已读用户时递增 |
| `kind` | `general` 普通公告（默认），或 `update` 更新公告 |
| `title` / `body` | 标题最多 100 字、正文最多 12000 字；支持分段、粗体、代码文字和简单列表，不执行 HTML 或打开远程链接 |
| `publishedAt` / `expiresAt` | 带时区的 ISO 8601；未来公告隐藏，到期公告保留在列表但不自动提醒 |
| `minVersion` / `maxVersion` | 可选，客户端版本范围，包含端点 |
| `version` | `kind=update` 时必填，公告对应的应用版本 |

发布更新公告时先发布签名 GitHub Release，再添加对应 `kind=update` 条目。公告与 GitHub 更新结果按版本合并，使用服务器正文优先；服务器公告不能指定或替换安装包地址、签名或执行命令。GitHub 检查失败时仍可阅读更新公告，重新检查成功后才能在窗口中下载。旧安装版仍从原 GitHub `latest.json` 检查升级，新版统一窗口不会改变签名协议。

## 客户端行为

标题栏铃铛、设置中的“公告与更新”和“检查更新”进入同一个窗口。启动后台并行检查公告与版本，每次启动最多自动展示一次，优先版本更新，其次未读有效公告。在课件整理页、其他弹窗、后台保存、窗口未激活时暂缓弹出；普通公告和更新自动检查开关独立。

“已阅读”按 `id:revision` 保存；“稍后提醒”和自动弹窗的关闭、Escape 延后 24 小时。手动打开后关闭不修改阅读状态。所有历史可在窗口中重新阅读，已读不会删掉正文。忽略更新仅影响对应版本的自动提醒，入口仍可手动查看。

本地状态保存在应用数据根目录 `announcements-state.json`，独立于课程资料库和 `update-settings.json`。自动成功缓存六小时，失败十五分钟退避；手动刷新立即请求。HTTPS 请求超时八秒，不跟随重定向；文件过大、格式错误或联网失败均保留上次有效内容，不阻断资料库操作。阅读状态不上传、不跨设备同步。

开发构建不会自动联网或执行正式更新；可以手动查看真实公告。回归测试使用独立 `.build/workbench-qa-*` 资料库，模拟更新结果不执行安装。

策略测试：`node --test scripts/dev/bulletin-policy.test.mjs`。真实窗口专项检查：`pwsh -NoProfile -File scripts/dev/test-workbench-live.ps1 -BulletinsOnly`；检查真实 HTTPS 公告、已读持久化、自动弹窗调度、下载失败、离线缓存、键盘隔离与三种宽度，版本更新结果使用隔离样例，不执行安装。
