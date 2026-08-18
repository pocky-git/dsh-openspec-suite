# dsh-openspec-suite

一个 DSH 插件，把 [OpenSpec](https://github.com/openspec-cn/openspec) 项目管理带进 DSH 工作台：

- **📁 项目导入**：选择一个文件夹，自动扫描其中所有含 `openspec/changes/` 的项目（支持嵌套，最深 4 层），一键导入 DSH 工作区
- **📊 提案进度总览**：在侧边栏工作区头部注入一个 OpenSpec 入口按钮，点击打开总览页，集中查看每个已导入项目的活跃提案（proposal / design / specs / tasks 产物完成度 + tasks.md 勾选进度）

## 安装

```sh
dsh plugin --profile <name> add dsh-openspec-suite
```

若环境中已安装 dsh-better-sidebar（侧边栏工作台），本插件与其互不干扰：注入的入口按钮和总览页是独立渲染的。

## 使用

1. 打开侧边栏 → 工作区列表头部 **+** 按钮旁的 **OpenSpec 图标按钮**
2. 输入或浏览选择一个文件夹 → **扫描**
3. 对发现的每个项目点击 **导入工作区**
4. 总览页实时显示各项目的提案进度（任务勾选比例、产物完成状态）

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

## License

MIT
