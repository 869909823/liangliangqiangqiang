# 踉踉跄跄 V2 工程交接

## 产品与版本

- 仓库：`869909823/liangliangqiangqiang`
- 开发分支：`v2`
- V1 回滚基线：`v0.1.0`
- 当前目标：`0.2.0-beta.1`
- 稳定目标：`0.2.0`
- Windows 应用标识：`com.liangliangqiangqiang.pet`，与 V1 相同

V2 不改变角色设计。脸型、三花纹路、浅蓝围巾、小鱼吊坠、键盘和身体比例出现视觉退化时，应当回退相关样式，而不是重新绘制角色。

## 架构边界

前端不使用框架或打包器，浏览器可直接加载 `src`。公共状态为：

```text
idle | working | thinking | error | complete | sleeping | fishing | muyu | quiz | story
```

其中 `fishing`、`muyu`、`quiz`、`story` 由 `src/js/activities.js` 玩法注册表定义，新增玩法只需在注册表追加一条并补按钮与动画。

仅在待机中出现的叠加动作为：

```text
blink | clickReaction | stretch | yawn | snack | peek
```

`src/app.js` 负责页面组装；`src/js` 分别承载台词、设置、平台适配、状态机、音频和自动调度。Windows 设置以 Rust 服务为唯一数据源，PWA 使用相同字段结构存入 `localStorage`。

Windows Rust 层按设置、显示模式、窗口几何、托盘和应用组装分责。鼠标穿透只属于当前会话，每次启动默认关闭；开机启动以操作系统实际状态为准。

窗口缩放使用同一张 `360×440` 设计画布，范围为 10%–200%，步进 10%。快捷档位保留 80%/100%/130%；高 DPI 或较小显示器会按工作区动态降低可用上限，10% 仍可作为救援尺寸。

## PWA 缓存与更新

`src/service-worker.js` 使用版本化缓存：

- HTML 导航采用 network-first，联网时优先取得新版页面，断网时回退缓存。
- CSS、JavaScript、图标和本地声音采用 cache-first。
- 缓存名包含 Service Worker 的 scope，因此正式根路径和 `/beta/` 不会互删或混用缓存。
- 新 Service Worker 完成应用外壳缓存且发现已有活动版本时，保持 waiting 状态并向页面发送：

```js
{ type: 'pwa:update-available', version: '0.2.0-beta.1' }
```

页面收到消息后显示“新版本已准备好，点击刷新”。用户点击后向 `registration.waiting` 发送 `{ type: 'SKIP_WAITING' }`；监听到一次 `controllerchange` 后再执行 `location.reload()`。新 worker 激活时只清理自身 scope 的旧缓存；正式根路径还会清理 V1 遗留缓存，`/beta/` 不会触碰根路径缓存。页面进入后台时应暂停调度与声音。

## 自动检查

本项目的 Web 检查完全使用 Node.js 内置模块，不运行 `npm install`：

```text
npm run check     JavaScript/JSON、版本、相对路径和工作流结构
npm test          状态、设置、调度、音频和 Service Worker 单元测试
npm run validate  依次运行上述两项
```

版本号必须同时更新：

1. `package.json`
2. `src/service-worker.js` 的 `APP_VERSION`
3. `src-tauri/tauri.conf.json`
4. `src-tauri/Cargo.toml`

`src-tauri/Cargo.lock` 必须提交。由于用户电脑不安装 Rust，首次可手动运行“构建 Windows”：云端会临时生成锁文件，并额外上传名称为 `generated-cargo-lock` 的 Artifact。只需下载其中的 `Cargo.lock`，放回 `src-tauri/Cargo.lock` 后提交。此后云端 Rust 检查使用 `--locked`；`release.yml` 会硬性阻止缺少锁文件的标签发布，避免同一版本在不同日期得到不同依赖组合。

## 发布通道

Beta Pages Artifact 的结构为：

```text
/
├─ V1（来自 v0.1.0）
└─ beta/
   └─ V2
```

稳定版发布时，V2 替换根路径。工作流不从当前线上网页反向下载文件；V1 根路径始终从不可变标签 `v0.1.0` 生成，结果可重复。

Windows 安装包由 GitHub 的 `windows-latest` 构建，不占用用户电脑空间。短期 Actions Artifact 保留 14 天；标签发布后，安装包与 `SHA256SUMS.txt` 同时存入 GitHub Release，作为长期下载来源。

## 尚需人工验收

自动测试不能代替下列 Windows 实机检查：桌面专属模式、Win+D、双屏负坐标、100%/150%/200% DPI、副屏拔插、Explorer 重启、睡眠唤醒、单实例、托盘救援、鼠标穿透恢复、V1 覆盖升级和退出后无残留进程。

手机端至少在 Android Chrome 与 iPhone Safari 验证添加到主屏幕、首次联网后的离线启动、横竖屏、安全区、后台静音和更新提示。

## 明确不做

Codex 状态联动、跨应用手机悬浮、WorkerW 嵌入、Live2D、账号、服务器、云同步、遥测、远程代码执行和静默自动更新均不属于 V2。
