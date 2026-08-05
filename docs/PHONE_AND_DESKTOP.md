# 手机与桌面使用方式

## 手机版

手机版是 PWA 网页，与 Windows 桌宠共用 `src` 中的角色、动画和台词。

发布到 HTTPS 网站后：

- Android Chrome：打开网页，选择“添加到主屏幕”或“安装应用”。
- iPhone Safari：打开网页，点击分享，再选择“添加到主屏幕”。
- 首次成功打开后，主要文件会缓存，短时间离线也能继续打开。

项目提供了手动运行的合并工作流 `.github/workflows/publish-mobile.yml`。代码放入 GitHub 仓库并启用 Pages 后，可以在 Actions 页面同时发布手机版并构建 Windows 版。这个过程使用 GitHub 的电脑，不占用本机编译空间。

直接把 `src` 文件夹复制到手机也可以作为普通网页尝试打开，但不同手机对本地网页有限制，不能保证“添加到主屏幕”和离线缓存可用。正式使用应发布到 HTTPS。

## Windows 桌面版

透明窗口、始终置顶、托盘和鼠标穿透必须由桌面程序提供，普通网页无法实现。

同一个 `.github/workflows/publish-mobile.yml` 会在 GitHub 的 Windows 电脑上安装临时工具并构建安装包，不在本机安装 Rust、Node 或 Tauri。构建完成后，从该次 Actions 运行的 Artifacts 下载 Windows 安装包即可。

## 共同限制

手机浏览器不能让宠物永久悬浮在其他应用上方。手机版是独立打开或添加到主屏幕的陪伴页面；Windows 版才是透明悬浮桌宠。
