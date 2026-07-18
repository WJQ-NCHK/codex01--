# AGENTS.md

## 项目概览

这是一个名为“方块世界”的第一人称 3D 体素生存网页游戏。玩家可以在程序生成的世界中移动、跳跃、奔跑、挖掘和放置方块，收集物品并维持生命值与饥饿值。

项目是一个前端单页应用，没有业务后端和数据库服务端；世界存档与设置保存在浏览器 IndexedDB 中。游戏支持 Three.js WebGPU 渲染，并可回退到 WebGL 2，同时使用 Web Worker 执行世界生成和区块网格计算。项目保留 Cloudflare Worker 部署入口，通过 Vinext/Vite 构建。

## 技术栈与运行环境

- Node.js：`>=22.13.0`
- React：`19.2.6`
- Next.js：`16.2.6`
- Three.js：`0.185.1`，渲染器从 `three/webgpu` 引入
- Vinext：`0.0.50`
- Vite：`8.0.13`
- TypeScript：`5.9.3`
- Vitest：`4.1.10`
- Testing Library + jsdom：用于 React 界面测试
- Tailwind CSS 4：通过 PostCSS 接入；主要页面视觉样式写在 `app/globals.css`
- Cloudflare：使用 `@cloudflare/vite-plugin`、Wrangler 和 `worker/index.ts`

## 目录结构

```text
.
├── app/
│   ├── page.tsx               # 应用入口，直接渲染 GameApp
│   ├── game-app.tsx            # 客户端游戏 UI、菜单、HUD、设置和弹窗
│   ├── layout.tsx              # 根布局、动态 metadata、中文语言标记和社交图片
│   └── globals.css             # 全屏画布、菜单、HUD、快捷栏和响应式样式
├── game/
│   ├── runtime.ts              # 游戏主运行时、输入、物理、生命周期和存档协调
│   ├── renderer.ts             # Three.js WebGPU/WebGL 2 渲染、光照、水面和粒子
│   ├── world.ts                # 世界尺寸、种子地形、方块读写、射线检测和碰撞
│   ├── mesh.ts                 # 区块可见面网格生成
│   ├── world.worker.ts         # Worker 端世界生成和区块网格计算
│   ├── worker-client.ts        # 主线程与世界 Worker 的请求/响应封装
│   ├── blocks.ts               # 方块、物品、背包和物品消耗逻辑
│   ├── types.ts                # 游戏状态、存档、Worker 消息和渲染类型
│   ├── storage.ts              # IndexedDB 存档、设置、校验和清理
│   └── audio.ts                # 基于 Web Audio API 的脚步、挖掘、放置等音效
├── public/
│   ├── favicon.svg             # 网站图标
│   └── og.png                  # Open Graph/Twitter 社交分享图片
├── worker/index.ts             # Cloudflare Worker 请求入口
├── build/sites-vite-plugin.ts  # 构建后复制 Sites hosting 元数据
├── tests/
│   ├── world.test.ts           # 世界生成、网格、射线、碰撞和背包单元测试
│   ├── game-app.test.tsx       # 游戏菜单和 React 交互测试
│   ├── rendered-html.test.mjs  # 应用入口与 HTML 结构测试
│   └── setup.ts                # Vitest 测试环境初始化
├── vite.config.ts              # Vinext、Sites 和 Cloudflare Vite 插件配置
├── vitest.config.ts            # Vitest、jsdom、路径别名和测试文件配置
├── next.config.ts              # Next 配置，目前基本使用默认值
├── .openai/hosting.json        # Sites 托管配置；D1/R2 绑定按当前文件为准
└── package.json                # 脚本、依赖和 Node 版本声明
```

`index.html` 已被移除，当前游戏不是 iframe 页面。`dist/`、`.next/`、`.vinext/`、`.wrangler/`、`work/` 等目录是构建或本地工具产物，不应作为源码提交。

## 应用入口与运行时关系

1. `app/page.tsx` 渲染 `GameApp`。
2. `app/game-app.tsx` 作为客户端组件创建 `GameRuntime`，订阅快照并渲染菜单、加载页、游戏 HUD、暂停页、死亡页和错误页。
3. `GameRuntime` 创建 `WorldWorkerClient` 与 `VoxelRenderer`，负责世界生命周期、玩家状态、输入、物理、交互和自动保存。
4. `WorldWorkerClient` 将种子世界生成与区块网格构建发送给 `game/world.worker.ts`，生成的 ArrayBuffer 和网格缓冲区通过 Transferable 返回主线程。
5. `VoxelRenderer` 将区块网格转换为 Three.js Mesh，负责相机、动态光照、昼夜天空、水材质、方块轮廓和粒子效果。

修改游戏 UI、菜单、HUD 或响应式布局时优先查看 `app/game-app.tsx` 与 `app/globals.css`；修改世界、输入、渲染或存档时查看对应的 `game/` 模块，不要重新引入被移除的 `index.html` iframe 架构。

## 游戏世界与核心机制

- 世界尺寸为 `128 × 64 × 128`，区块尺寸为 `16`，即 `8 × 4 × 8` 个区块。
- 方块数据存放在 `Uint8Array` 中，世界索引由 `worldIndex(x, y, z)` 计算。
- `generateWorld(seed, changes)` 使用种子、正弦/余弦地形函数和整数哈希生成地形；包含草方块、泥土、圆石、橡木、树叶、沙子、水和木板。
- 世界包含海平面、树木和中心出生区域；修改方块会作为 `[index, block]` 变更记录保存，并在重新载入时应用。
- `mesh.ts` 只生成暴露面的三角形，固体与水面使用独立缓冲；跨区块修改时会重建受影响区块及相邻区块。
- Three.js 渲染器优先使用 WebGPU；`?renderer=webgl2` 可强制使用 WebGL 2 后端。`GameSnapshot.backend` 会显示当前后端。
- 渲染包含像素风程序纹理图集、雾效、昼夜光照、动态阴影、水面透明材质、目标方块轮廓和挖掘/放置粒子。
- 玩家采用分轴移动、重力、跳跃、奔跑和实体方块碰撞；水和非实体方块不会阻挡玩家。
- 左键持续挖掘目标方块，挖掘进度由方块硬度决定；右键放置方块，若放置后与玩家碰撞会回滚。
- 树叶有概率掉落苹果；苹果可通过右键使用并恢复饥饿值。
- 背包有 9 个快捷栏槽位，支持数字键 `1-9`、鼠标滚轮和点击切换。
- HUD 显示坐标、朝向、渲染后端、FPS、面数、天数、时间、存档状态、生命值、饥饿值、目标方块、挖掘进度、快捷栏和小地图。

## 输入与界面流程

- `W/A/S/D`：移动。
- `Space`：跳跃。
- `Shift`：奔跑。
- 鼠标移动：控制第一人称视角；优先使用 Pointer Lock，不支持时使用备用鼠标视角。
- 鼠标左键：持续挖掘。
- 鼠标右键：放置方块；选中苹果时用于进食。
- 数字键 `1-9` / 鼠标滚轮：选择快捷栏槽位。
- `Esc`：暂停并释放鼠标锁定。
- 窗口失焦或页面隐藏时会自动暂停。
- 首次进入可创建新世界；已有存档时可继续或确认删除后重新生成。
- 菜单和暂停页支持鼠标灵敏度、Y 轴反转、音量、静音和动态阴影设置。
- 存档存在 IndexedDB 时，菜单显示“继续世界”；世界变更和玩家状态会延迟自动保存。

## 常用命令

安装依赖：

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

运行完整测试（先构建，再运行 Vitest 和 Node 测试）：

```bash
npm test
```

只运行 Vitest：

```bash
npm run test:unit
```

类型检查：

```bash
npm run typecheck
```

运行 ESLint：

```bash
npm run lint
```

## 测试与验证要求

- `tests/world.test.ts` 覆盖相同种子确定性、边界读写、孤立方块六面网格、射线命中、实体碰撞、背包消耗和存档结构校验。
- `tests/game-app.test.tsx` 使用 mock 的 `GameRuntime` 检查中文菜单、新世界入口、设置控件和开始游戏流程。
- `tests/rendered-html.test.mjs` 确认根页面直接使用 `GameApp`、游戏 UI 含 Canvas 和渲染后端提示，并确认 `index.html` 与默认 Next 示例 SVG 不存在。
- 修改 `game/world.ts`、`game/mesh.ts`、`game/blocks.ts`、`game/storage.ts` 或 `game/runtime.ts` 时，至少运行 `npm run test:unit` 和 `npm run typecheck`。
- 修改入口、布局、渲染配置或构建配置时，运行 `npm test` 和 `npm run lint`。
- 修改渲染、输入或 UI 后，应在浏览器实际验证 WebGPU、`?renderer=webgl2` 回退、指针锁定、移动/跳跃、挖掘/放置、暂停、存档恢复和 HUD。
- 当前源码、测试和 README 的部分中文文本存在疑似字符编码乱码。编辑中文时统一使用 UTF-8，并检查浏览器实际显示和测试字符串，不要把已正常工作的文本转换成其他编码。

## 配置与部署注意事项

- `vite.config.ts` 使用 `vinext()`、`sites()` 和 Cloudflare 插件，Worker 主入口为 `./worker/index.ts`。
- `worker/index.ts` 将请求交给 `vinext/server/app-router-entry` 的 `handler.fetch`。
- `build/sites-vite-plugin.ts` 在构建结束时将 `.openai/hosting.json` 复制到 `dist/.openai/hosting.json`。
- Wrangler 和 Miniflare 的日志、注册表路径固定到项目内 `.wrangler/`；这些是本地工具状态，不是应用数据。
- 应用环境变量应放在被 `.gitignore` 排除的 `.env*` 文件中，禁止把密钥写入仓库。
- `.openai/hosting.json` 中的 D1、R2 绑定按当前文件为准；若启用绑定，要同步检查 `vite.config.ts` 的 binding、数据库占位 ID 和 bucket 配置。
- `public/og.png` 被根布局用于动态 Open Graph/Twitter metadata，修改 metadata 时要保持图片路径和可访问性。

## 修改原则

- 保持 `app/page.tsx` → `GameApp` → `GameRuntime` 的入口链路，不要恢复 iframe 方案。
- 保持 `GameRuntime` 的生命周期清理：组件卸载时必须取消订阅、停止动画、终止 Worker、释放音频和 Three.js 资源。
- 修改世界尺寸或区块尺寸时，同时检查世界索引、生成器、区块循环、相邻区块重建、碰撞、射线、小地图和测试数据。
- 修改方块或物品时，同时更新 `BlockId`、`BLOCKS`、`ITEM_META`、背包初始化、掉落/消耗逻辑、纹理图集和相关测试。
- 修改 Worker 消息结构时，同时更新 `game/types.ts`、`worker-client.ts`、`world.worker.ts` 以及 Transferable 缓冲区处理。
- 修改渲染后端时，同时验证 Three.js WebGPU 初始化、WebGL 2 强制回退、Canvas 尺寸、材质、阴影和资源释放。
- 修改输入事件时，同时检查 Pointer Lock、备用鼠标模式、窗口失焦自动暂停、默认浏览器行为和移动端提示。
- 不要提交 `node_modules/`、构建产物、`.wrangler/`、`work/` 状态文件或本地环境变量文件。
