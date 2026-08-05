# 手机与 Windows 使用方式

## 手机版 PWA

Beta 地址：`https://869909823.github.io/liangliangqiangqiang/beta/`

稳定版地址：`https://869909823.github.io/liangliangqiangqiang/`

- Android Chrome：打开地址，选择“安装应用”或“添加到主屏幕”。
- iPhone Safari：打开地址，点击分享，再选择“添加到主屏幕”。
- 第一次必须联网完整打开；随后主要页面、角色资源和本地声音可离线使用。
- 浏览器要求用户先点击页面才能播放声音。切到后台后，宠物会暂停动作和声音。
- 页面提示“新版本已准备好”时，点击提示刷新；无需删除再安装。

手机版是独立打开的陪伴页面。Android 和 iOS 浏览器都不能保证让网页宠物长期浮在其他应用上方，本项目不请求高风险的系统悬浮权限。

## Windows 桌面版

Windows 版提供透明无边框窗口、桌面专属模式、普通模式、置顶模式、托盘、缩放、位置记忆和单实例。这些能力由 Tauri 壳提供，普通网页无法验证。

不需要在用户电脑上安装 Rust、Node.js 或 Tauri。进入 GitHub Actions，手动运行“构建 Windows”，完成后下载 `windows-installer` Artifact；正式发布后则优先从 GitHub Release 下载长期保存的安装包和校验文件。

鼠标穿透每次启动默认关闭。开启后窗口不能接收鼠标，应从系统托盘关闭穿透；如果宠物跑到屏幕外，从托盘选择“重置位置”。

## 数据差异

Windows 设置保存在应用配置目录，并由 Rust 负责校验和原子写入。手机设置保存在当前浏览器的 `localStorage`。两端字段含义一致，但没有账号或云同步，因此设置不会跨设备自动复制。
