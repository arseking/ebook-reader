# 纸间 · TXT 阅读器

一款面向 Windows 的本地 TXT 桌面阅读器。书籍内容不会上传；书架、阅读进度和字号偏好保存在本机。

## 运行方式

### 从源码开发运行

先安装 Node.js（包含 npm），然后在项目根目录运行：

```powershell
npm ci
npm run dev
```

`npm run dev` 会启动 Vite 开发服务器和 Electron 桌面窗口。修改 `src/` 中的界面代码后，Vite 会提供开发热更新。

### 构建并运行生产版

```powershell
npm ci
npm run build
npm start
```

构建会生成 `dist/` 和 `dist-electron/`；`npm start` 启动该构建版本。

### 生成 Windows 安装包

```powershell
npm ci
npm run dist
```

安装包和解包版输出到 `release/`。首次打包可能需要下载 Electron 和 Windows 安装器组件；网络无法访问下载源时，打包可能中断。若只需要解包版，可运行：

```powershell
npm run build
npx electron-builder --win --dir
```

解包版程序位于 `release/win-unpacked/纸间.exe`。

## 使用阅读器

启动应用后，点击“打开 TXT 文件”并选择本地文本。应用会尝试识别 UTF-8 或 GB18030；无法自动识别时，可以在提示框中选择 UTF-8、GB18030、UTF-16 LE、Big5 或 Shift JIS。阅读时可调整字号、滚动正文；阅读位置和字号偏好会自动保存在这台设备上。再次打开书架中的文件即可继续阅读。

## 测试

```powershell
npm test
```
