# AGENTS.md

## 项目概览

这是一个名为“方块世界”的第一人称 3D 生存模式网页游戏。游戏使用 WebGL 在浏览器中渲染固定尺寸的体素世界，玩家可以探索地形、采集方块并放置方块建造。

当前项目是一个前端单页应用，没有后端业务逻辑或数据库数据层。项目同时保留了 Cloudflare Worker 部署入口，可通过 Vinext/Vite 运行和构建。

## 技术栈与运行环境

- Node.js：`>=22.13.0`
- React：`19.2.6`
- Next.js：`16.2.6`
- Vinext：`0.0.50`
- Vite：`8.0.13`
- TypeScript：`5.9.3`
- WebGL 1：游戏本体直接使用浏览器原生 WebGL API
- Tailwind CSS 4：通过 PostCSS 接入，主要用于应用壳样式基础
- Cloudflare：使用 `@cloudflare/vite-plugin` 和 Wrangler，Worker 入口位于 `worker/index.ts`

## 目录结构

```text
.
├── index.html                 # 游戏本体：WebGL、世界生成、物理、交互和 HUD
├── app/
│   ├── page.tsx               # Next/Vinext 应用页，通过 iframe 加载 /index.html
│   ├── layout.tsx             # 根布局、中文语言标记、页面元数据和 favicon
│   └── globals.css            # 应用壳全屏布局样式
├── public/
│   └── favicon.svg            # 网站图标
├── worker/index.ts            # Cloudflare Worker 请求入口
├── build/sites-vite-plugin.ts # 构建完成后打包 Sites hosting 元数据
├── tests/rendered-html.test.mjs # 构建后 HTML/入口连线的 Node 测试
├── vite.config.ts             # Vinext、Sites 和 Cloudflare Vite 插件配置
├── next.config.ts             # Next 配置，目前使用默认配置
├── .openai/hosting.json       # Sites 托管配置；当前 D1、R2 均为 null
└── package.json               # 脚本和依赖声明
```

`dist/`、`.wrangler/`、`.vinext/`、`.next/` 等目录属于构建或本地运行产物，已在 `.gitignore` 中排除，不应当作为源码修改。

## 应用与游戏入口关系

访问应用根页面时，`app/page.tsx` 返回一个全屏 iframe，其 `src` 固定为 `/index.html`。因此：

1. `app/` 负责 Next/Vinext 应用壳和页面元数据。
2. `index.html` 才是实际可玩的游戏页面和主要运行时代码。
3. 修改游戏画面、HUD、方块、输入、世界生成或 WebGL 渲染时，优先检查并修改 `index.html`。
4. 修改 iframe 尺寸或应用壳背景时，检查 `app/globals.css` 和 `app/page.tsx`。

## 游戏实现要点

- 世界尺寸为 `40 × 22 × 40`，方块数据存放在 `Uint8Array` 中。
- 地形高度由确定性的正弦波、余弦波和哈希函数生成；包含草方块、泥土、圆石、橡木、树叶、沙子、水和木板等类型。
- 世界生成后会创建树木，并在中心区域生成固定出生点。
- 网格只生成可见面，使用程序生成的像素风纹理图集；深度测试、背面剔除、雾效和面朝向明暗共同用于渲染。
- 玩家使用碰撞检测、分轴移动和重力；`Space` 跳跃，`Shift` 加速奔跑。
- 鼠标指针锁定后控制第一人称视角；不支持指针锁定时提供备用鼠标视角模式。
- 左键通过射线检测挖掘方块，右键放置当前选中的方块；放置后会检查玩家碰撞并在冲突时回滚。
- 底部快捷栏支持点击、数字键 `1-7` 和鼠标滚轮切换。
- HUD 包含坐标、朝向、时间、FPS/面数、准星、目标方块名称、生命/饥饿显示、快捷栏和固定区域小地图。
- 菜单支持鼠标灵敏度和 Y 轴反转设置；`Esc` 释放指针锁定并暂停，点击按钮继续。

## 常用命令

首次运行或依赖变更后：

```bash
npm install
```

本地开发：

```bash
npm run dev
```

构建生产版本：

```bash
npm run build
```

启动构建结果：

```bash
npm run start
```

运行测试（会先构建）：

```bash
npm test
```

运行 ESLint：

```bash
npm run lint
```

## 测试与修改要求

- `npm test` 会先执行 `vinext build`，再运行 `tests/rendered-html.test.mjs`。
- 当前测试会确认 `index.html` 含有 Canvas 和 WebGL 标记、应用页仍然指向 `/index.html`、根布局使用 `zh-CN`，并确认若干默认 Next 静态 SVG 不存在。
- 涉及入口、布局、构建配置或游戏页面的修改，至少运行 `npm test`；涉及 TypeScript/React 配置时同时运行 `npm run lint`。
- 游戏本体是一个内嵌脚本的独立 HTML 页面，修改后应在浏览器中实际打开并检查 WebGL、鼠标锁定、键盘移动、挖掘/放置和 HUD。
- 当前源码和 README 的部分中文文本存在疑似字符编码乱码。编辑中文内容时统一使用 UTF-8，并注意不要把已经正常显示的文本转换成其他编码；修改后应检查浏览器中的实际显示效果。

## 配置与部署注意事项

- `vite.config.ts` 通过 `vinext()`、`sites()` 和 Cloudflare 插件组成构建流程，并将 Worker 主入口配置为 `./worker/index.ts`。
- `worker/index.ts` 将请求转交给 `vinext/server/app-router-entry` 的 `handler.fetch`。
- Wrangler、Miniflare 的日志和注册表路径被固定到项目内的 `.wrangler/`；这些属于本地工具状态，不是应用数据。
- 应用环境变量应放在被 `.gitignore` 排除的 `.env*` 文件中，不要把密钥写入仓库配置。
- `.openai/hosting.json` 当前未配置 D1 或 R2；如果将来启用绑定，需要同步检查 `vite.config.ts` 中的占位 database ID 和 bucket 配置。

## 修改原则

- 保持 `app/page.tsx` 到 `/index.html` 的 iframe 连接，除非明确要重构应用入口。
- 保持 `index.html` 中 Canvas、WebGL 初始化和动画循环的浏览器兼容性；不要未经验证地引入只适用于 Node.js 的 API。
- 修改方块数据或世界尺寸时，同时检查 `rebuildMesh`、碰撞检测、射线检测、小地图和出生点逻辑。
- 修改输入事件时，同时检查指针锁定状态、备用鼠标模式、默认浏览器行为和移动端媒体查询。
- 不要提交 `node_modules/`、构建产物、`.wrangler/` 状态文件或本地环境变量文件。
