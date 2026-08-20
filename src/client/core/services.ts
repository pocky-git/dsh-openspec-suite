/**
 * 跨插件服务调用适配层：会话定位/草稿、better-sidebar 编辑器。
 * 统一持有 apply 时捕获的插件上下文，失败路径返回 false 由调用方降级。
 */

import type { Context } from '../../client-context.ts'

/**
 * 当前插件上下文（apply 时捕获）。用于跨插件服务调用——dsh-better-sidebar
 * 的 ctx.betterSidebar.openFile（把产物打开到侧栏编辑器）、dsh-client-runtime
 * 的 ctx.sessions / ctx.workspaces（会话定位与新建提案会话）。
 */
let pluginContext: Context | undefined

/** apply 时捕获插件上下文（客户端入口调用）。 */
export function setPluginContext(ctx: Context | undefined): void {
  pluginContext = ctx
}

/** 提案的会话定位：打开该会话并返回其 id。 */
export function openSession(sessionId: string): boolean {
  const ctx = pluginContext
  if (ctx === undefined) return false
  try {
    ctx.sessions.open(sessionId)
    return true
  } catch {
    return false
  }
}

/** conversation 服务的结构子集（ctx.get 懒读，跨插件服务）。 */
interface ConversationSubset {
  input: { for(actx: unknown): { setDraft(t: string): void; submit(): void } }
}

/** conversation.input.for 返回的输入句柄。 */
type ConversationInput = ReturnType<ConversationSubset['input']['for']>

/** 取当前选中会话的 conversation 输入句柄；不可用时 undefined。 */
function currentConversationInput(): ConversationInput | undefined {
  const ctx = pluginContext
  if (ctx === undefined) return undefined
  const current = ctx.sessions.list.getSnapshot().current
  if (current === undefined) return undefined
  const scoped = ctx.sessions.scope(current)
  if (scoped === undefined) return undefined
  // conversation 是跨插件服务：inject 声明属 dsh-client-ui-conversation
  // 的消费面，这里按 better-sidebar 的同款模式用 ctx.get 懒读。
  const conversation = ctx.get('conversation') as ConversationSubset | undefined
  if (conversation === undefined) return undefined
  return conversation.input.for(scoped)
}

/**
 * 为当前打开的会话预填 composer 草稿（如 /openspec-new-change）。
 * 会话必须刚被 sessions.open 选中。成功返回 true。
 */
export function prefillDraft(text: string): boolean {
  try {
    const input = currentConversationInput()
    if (input === undefined) return false
    input.setDraft(text)
    return true
  } catch {
    return false
  }
}

/**
 * 提交当前会话的 composer 草稿（等价于用户按下发送）。
 * 会话必须已被 sessions.open 选中且草稿已预填。成功返回 true。
 */
export function submitDraft(): boolean {
  try {
    const input = currentConversationInput()
    if (input === undefined) return false
    input.submit()
    return true
  } catch {
    return false
  }
}

/**
 * 把文件打开到 dsh-better-sidebar 的编辑器 tab。成功打开返回
 * true；无活动会话或调用失败返回 false（调用方回退应用内预览）。
 */
export function openInBetterSidebar(path: string, title: string): boolean {
  const ctx = pluginContext
  if (ctx === undefined) return false
  try {
    const sessionId = ctx.betterSidebar.getSnapshot().sessionId
    if (sessionId === undefined || sessionId === '') return false
    ctx.betterSidebar.openFile({ sessionId }, path, title)
    return true
  } catch {
    return false
  }
}

/** 轮询等待 workspaces.startSession 建立的新会话成为 current。 */
export async function waitForNewSession(before: Set<string>, attempts = 20, intervalMs = 100): Promise<string | undefined> {
  const ctx = pluginContext
  if (ctx === undefined) return undefined
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
    const current = ctx.sessions.list.getSnapshot().current
    // current 变成不在旧会话集合里的会话 = 新会话已就绪。
    if (current !== undefined && !before.has(current)) return current
  }
  return undefined
}

/** 在项目工作区上新建 agent 会话（不等待就绪）。 */
export function startWorkspaceSession(workspaceId: string): void {
  pluginContext?.workspaces.startSession(workspaceId)
}
