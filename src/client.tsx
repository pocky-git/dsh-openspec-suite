/**
 * dsh-openspec-suite 客户端部分入口。
 *
 * 1. 在左侧边栏根部，“新建会话”按钮与工作区浏览区域之间，
 *    注入一个“图标 + 文字”按钮（宽模式下显示图标与 OpenSpec 文字，
 *    窄/rail 模式下仅显示图标）。点击后打开 OpenSpec 总览页（见 2）。
 * 2. 总览页本身是左侧边栏内的一个二级页面：一个覆盖工作区浏览区域
 *    （区域标题 + 会话列表）的浮层，拥有自己的头部（“← 返回” + 标题）
 *    以及已导入项目的只读列表。每个项目带“创建提案”按钮（新建会话并
 *    预填 /openspec-new-change 命令）；每个提案行点击行首定位到该
 *    提案的会话，展开可查看产物清单；已归档提案保留归档日期。
 *
 * 通过同源的 `/openspec/api/*` JSON 信封（{ok, value} / {ok:false, error}）
 * 与宿主部分通信。实现按功能拆分在 ./client/ 下：
 * - api.ts / types.ts       宿主 API 封装与 wire 类型
 * - services.ts             跨插件服务适配（会话/草稿/better-sidebar）
 * - suite-state.ts          头部按钮与总览页共享的发布/订阅 store
 * - sidebar-injection.tsx   侧栏入口按钮 + 二级页面浮层注入
 * - overview-page.tsx       总览页（项目列表/导入/创建提案）
 * - change-row.tsx          提案行与归档折叠区
 * - new-change-dialog.tsx   创建提案弹窗
 * - dir-picker.tsx          应用内目录浏览器（降级方案）
 * - file-preview.tsx        Markdown/HTML 产物预览
 * - html-viewer.tsx         better-sidebar 上的 HTML 预览器
 * - format.ts / icons.tsx   展示工具与图标
 *
 * 样式统一放在 ./client.less，组件里只挂类名。
 */

/**
 * 必选依赖：dsh-better-sidebar（产物打开到侧栏编辑器 + 注册 HTML
 * 预览器）、dsh-client-runtime 的 sessions / workspaces（会话定位与
 * 新建提案会话）。dsh web 运行时不支持 'xxx?' 可选注入语法（会把
 * 'xxx?' 当成字面服务名等待，导致插件永远 pending），所以要么必选
 * 要么运行时 ctx.get 懒读。conversation 服务用 ctx.get 懒读。
 */
export const inject = ['betterSidebar', 'sessions', 'workspaces']

/** 插件标识。 */
export const name = 'dsh-openspec-suite/client'

import type { Context } from './client-context.ts'
import { setPluginContext } from './client/core/services.ts'
import { injectSidebar } from './client/sidebar-injection.tsx'
import { registerSidebarViewers } from './client/components/html-viewer.tsx'
import './client.less'

/** 插件入口：注册侧栏注入与 HTML 预览器，随上下文销毁时清理。 */
export function apply(ctx: Context): void {
  setPluginContext(ctx)
  ctx.effect(() => {
    const dispose = injectSidebar().destroy
    const disposeViewer = registerSidebarViewers(ctx)
    return () => {
      setPluginContext(undefined)
      disposeViewer?.()
      dispose()
    }
  })
}
