# dsh-openspec-suite

一个 DSH 插件，把 [OpenSpec](https://github.com/openspec-cn/openspec) 项目管理带进 DSH 工作台：

- **📁 项目导入**：选择一个文件夹，自动扫描其中所有含 `openspec/changes/` 的项目（支持嵌套，最深 4 层），一键导入 DSH 工作区
- **📊 提案总览**：在侧边栏工作区头部注入一个 OpenSpec 入口按钮，点击打开总览页，集中查看每个已导入项目的提案与产物生成状态；已归档提案单独折叠展示（保留归档日期）
- **📄 产物列举与预览**：每个提案行可展开，列出目录下**全部**产物文件（递归，含 specs/ 子目录、schema 自定义产物如 brainstorm.md / code-changes.md / design.html 等，附大小与修改时间）；点击任一文件在应用内预览——Markdown 安全渲染，交互式 HTML（如 design.html）经沙箱 iframe 加载（Mermaid/Alpine 等相对路径依赖可正常解析）
- **🧩 自定义 schema 支持**：若项目定义了 `openspec/schemas/` 下的自定义 schema.yaml，提案卡片会按 schema 的 artifacts 展示期望产物 chips（✓ 已产出 / ○ 缺失），一眼看出工作流推进到哪个阶段

## 安装

```sh
dsh plugin --profile <name> add dsh-openspec-suite
```

若环境中已安装 dsh-better-sidebar（侧边栏工作台），本插件与其互不干扰：注入的入口按钮和总览页是独立渲染的。

## 使用

1. 打开侧边栏 → 工作区列表头部 **+** 按钮旁的 **OpenSpec 图标按钮**
2. 输入或浏览选择一个文件夹 → **扫描**
3. 对发现的每个项目点击 **导入工作区**
4. 总览页实时显示各项目的提案与产物生成状态（✓ 已生成 / ○ 未生成）

## 架构

- **Host 半**（`lib/index.mjs`）：
  - `/openspec/api/*` JSON API（loopback 信任栅栏，只接受 localhost/127.0.0.1 请求）：`dir.list` / `pick` / `scan` / `scanAndImportAll` / `import` / `remove` / `overview` / `prefs.get`
  - 通过宿主的 `workspaceRegistry` 导入/删除工作区，与 DSH 工作区双向同步
  - 设置命名空间 `dsh-openspec-suite` 持久化已导入项目列表与最近扫描目录
- **Client 半**（`lib/client.js`，ModuleLoader 信封）：不依赖其他客户端插件，通过 MutationObserver 定位侧边栏工作区头部的 + 按钮，在其右侧注入入口按钮；总览页是渲染在工作区浏览区域上的浮层（独立 React root）

## 开发

```sh
pnpm install
pnpm run build     # tsdown (host) + scripts/build-client.mjs (client ModuleLoader bundle)
pnpm run typecheck
```

进度解析直接读取 `openspec/` 目录结构，不依赖 openspec CLI。

### 源码结构

两端的实现按「领域逻辑 / 传输与 API / 组件 / 基础层」分类放在子文件夹中，入口文件只做装配：

```
src/
├── index.ts                      # 宿主半入口（装配 + 导出公共 API）
├── client.tsx                    # 客户端半入口（装配）
├── host/                         # 宿主半
│   ├── openspec/                 #   OpenSpec 领域逻辑
│   │   ├── scan.ts               #     项目发现（目录扫描）
│   │   ├── changes.ts            #     提案进度（状态/产物/任务解析）
│   │   └── change-session-bindings.ts  # 提案 → 会话绑定（标记文件 + 对账）
│   ├── api/                      #   HTTP API 层
│   │   ├── routes.ts             #     路由注册与分发
│   │   ├── handlers.ts           #     各 API 方法的业务实现
│   │   └── wire.ts               #     传输层辅助（栅栏/信封/校验）
│   └── prefs.ts                  #   设置命名空间与偏好读写
└── client/                       # 客户端半
    ├── core/                     #   基础层（非组件）
    │   ├── api.ts / types.ts     #     宿主 API 封装与 wire 类型
    │   ├── services.ts           #     跨插件服务适配（会话/草稿/better-sidebar）
    │   ├── suite-state.ts        #     共享发布/订阅 store
    │   ├── change-session.ts     #     提案 → 会话匹配
    │   └── format.ts             #     展示工具（字节/时间/路径）
    ├── components/               #   React 组件
    │   ├── overview-page.tsx     #     总览页（项目列表/导入/创建提案）
    │   ├── change-row.tsx        #     提案行与归档折叠区
    │   ├── new-change-dialog.tsx #     创建提案弹窗
    │   ├── dir-picker.tsx        #     应用内目录浏览器（降级方案）
    │   ├── file-preview.tsx      #     Markdown/HTML 产物预览
    │   ├── html-viewer.tsx       #     better-sidebar 上的 HTML 预览器
    │   └── icons.tsx             #     图标组件
    └── sidebar-injection.tsx     #   侧栏入口按钮 + 二级页面浮层注入
```

## License

MIT
