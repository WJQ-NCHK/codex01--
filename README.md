# 方块世界

一个桌面优先的第一人称 3D 体素生存游戏。项目使用 React 19、TypeScript、Three.js WebGPU/WebGL 2 双后端和 Web Worker，通过 Vinext/Vite 构建并可部署到 Cloudflare Worker。

## 玩法

- `W A S D`：移动
- 鼠标：第一人称视角
- `Space`：跳跃
- `Shift`：疾跑
- 鼠标左键：持续挖掘
- 鼠标右键：放置方块或进食
- 数字键 `1-9` / 滚轮：切换快捷栏
- `Esc`：暂停并释放鼠标

## 开发

```bash
npm install
npm run dev
```

## 验证

```bash
npm test
npm run typecheck
npm run lint
```

在 URL 添加 `?renderer=webgl2` 可强制使用 WebGL 2 回退后端。世界、背包、玩家状态和设置保存在当前浏览器的 IndexedDB 中。
