# 踉踉跄跄 V2

一只努力跟上每个任务进度的三花猫。V2 继续使用 V1 的圆脸、三花纹路、浅蓝围巾、小鱼吊坠、键盘和整体比例，不重新设计角色。

当前版本：`0.2.0-beta.1`

## V2 重点

- Windows 提供桌面专属、普通非置顶、始终置顶三种显示模式，默认只在桌面出现。
- 窗口按 10%–200% 等比例缩放（步进 10%），并记忆显示器、位置和设置。
- 七个主状态：待机、工作、思考、出错、完成、睡觉、摸鱼。
- 新增伸懒腰、打哈欠、吃小鱼干、偷看用户四个自然待机动作。
- 摸鱼时敲三次木鱼；本地声音默认关闭，启用后的默认音量为 25%。
- 手机版是可添加到主屏幕的 PWA，共用角色状态和声音，但不能跨应用悬浮。

## 无安装预览

项目继续使用原生 HTML、CSS 和 JavaScript，不需要前端框架。不要直接双击 `src/index.html`：`file://` 会拦截模块脚本，页面会显示但没有动作。电脑已有 Python 时，双击项目根目录的 `打开预览.vbs` 即可无终端启动本地预览；也可以手动运行：

```powershell
python -m http.server 4173 -d src
```

再打开 `http://localhost:4173`。普通浏览器只能验证角色和 PWA 页面，不能验证透明窗口、托盘或 Windows 显示模式。

用户不需要在本机安装 Node.js、Rust 或 Tauri。推送到 GitHub 后，由 Actions 在云端验证、发布网页并生成 Windows 安装包。

仓库第一次还没有 `src-tauri/Cargo.lock` 时，手动运行一次“构建 Windows”，下载同次运行中的 `generated-cargo-lock` Artifact，把其中的文件放回 `src-tauri/Cargo.lock` 并提交。正式 Release 会在锁文件缺失时停止，避免依赖漂移。

## 云端工作流

| 工作流 | 用途 | 触发方式 |
| --- | --- | --- |
| `validate.yml` | JavaScript、状态/设置/PWA 单测、Rust 格式和编译检查 | 推送、PR、手动 |
| `publish-mobile.yml` | 发布手机版；Beta 放在 `/beta/`，稳定版放在根路径 | 版本标签或手动 |
| `build-windows.yml` | 构建 NSIS 安装包和 SHA-256 文件 | 手动，或由 Release 调用 |
| `release.yml` | 将 Windows 安装包长期附加到 GitHub Release | `v0.2.*` 标签 |

发布步骤与回滚方式见 [发布检查清单](docs/RELEASE_CHECKLIST.md)，工程边界和接手说明见 [V2 交接文档](docs/V2_HANDOFF.md)。

## 项目边界

- 不接入 Codex 内部状态。
- 不使用不稳定的 Explorer `WorkerW` 强制嵌入。
- 不加入 Live2D、账号、云同步、遥测、远程代码或自动安装更新。
- 更新检查只提示 GitHub Release 下载页面。
