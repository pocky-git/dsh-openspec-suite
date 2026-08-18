# dsh-openspec-suite

一个 DSH 插件，把 [OpenSpec](https://github.com/openspec-cn/openspec) 项目管理带进 DSH 工作台：

- **📁 项目导入**：选择一个文件夹，自动扫描其中所有含 `openspec/changes/` 的项目（支持嵌套，最深 4 层），一键导入 DSH 工作区
- **📊 提案进度总览**：better-sidebar 侧边栏新增 "OpenSpec" Tab，集中查看每个已导入项目的活跃提案（proposal / design / specs / tasks 产物完成度 + tasks.md 勾选进度）
- **🔌 自动携带 dsh-better-sidebar**：本插件以 `dsh-better-sidebar` 为硬依赖——安装本插件即自动带上完整的侧边栏工作台（文件管理 / 编辑器 / 终端 / Git），无需单独安装

## 安装

```sh
dsh plugin --profile <name> add dsh-openspec-suite
```

若用户已单独安装 dsh-better-sidebar，本插件检测到后不会重复挂载（运行时按 loader entry 去重）。

## 使用

1. 打开右侧边栏 → **+** → **OpenSpec**
2. 输入或浏览选择一个文件夹 → **扫描**
3. 对发现的每个项目点击 **导入工作区**
4. 总览页实时显示各项目的提案进度（任务勾选比例、产物完成状态）

## 架构

- **Host 半**（`lib/index.mjs`）：
  - 启动时检测 loader，未挂载 better-sidebar 则动态创建内存 loader entry（幂等，进程结束即消失）
  - `/openspec/api/*` JSON API（与 better-sidebar 同款 loopback 信任栅栏）：`dir.list` / `scan` / `import` / `remove` / `overview` / `prefs.get`
  - 设置命名空间 `dsh-openspec-suite` 持久化已导入项目列表与最近扫描目录
- **Client 半**（`lib/client.js`，ModuleLoader 信封）：`inject: ['betterSidebar']` 注册 `openspec-suite:overview` Tab

## 开发

```sh
pnpm install
pnpm run build     # tsdown (host) + scripts/build-client.mjs (client ModuleLoader bundle)
pnpm run typecheck
```

进度解析直接读取 `openspec/` 目录结构，不依赖 openspec CLI。

## License

MIT
