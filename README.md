# 踉踉跄跄

一只努力跟上每个任务进度的三花猫 Windows 桌面宠物。

## 当前版本

`0.1.0` 是可交互的桌面版起点：沿用第一版 CSS 三花猫造型，包含待机、工作、思考、出错、完成、睡觉和自动陪伴，支持点击反应、拖动、气泡开关、置顶、鼠标穿透、托盘菜单和开机启动菜单项。

同一套前端也是可安装的手机 PWA。手机发布与不占用本机空间的 Windows 云端打包方式见 `docs/PHONE_AND_DESKTOP.md`。

## 预览前端

无需安装前端依赖。进入项目目录后运行：

```powershell
python -m http.server 4173 -d src
```

打开 `http://localhost:4173`。普通浏览器中无法验证透明桌面窗口、托盘和开机启动。

## 运行桌面版

先安装 Windows WebView2、Rust stable 与 Node.js，然后执行：

```powershell
npm install
npm run tauri dev
```

打包：

```powershell
npm run tauri build
```

如果不希望在本机安装开发工具，可以把项目放入 GitHub 仓库，再手动运行项目自带的 GitHub Actions 工作流。构建发生在云端，本机只需下载最终安装包。

## 操作

- 拖动猫咪移动窗口。
- 单击猫咪触发随机反应。
- 点击下方圆点展开状态栏。
- 右键猫咪显示/隐藏文字气泡。
- 托盘菜单可切换置顶、鼠标穿透、开机启动，或退出程序。

鼠标穿透开启后，窗口本身不能接收鼠标；请从系统托盘关闭穿透。
