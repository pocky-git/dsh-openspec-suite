/** 客户端半的 Context 类型增强。 */
import type { Context } from '@deepseek-ai/cordis'

/** dsh-better-sidebar 客户端服务的结构子集（openFile / registerFileViewer 所需部分）。 */
export interface BetterSidebarServiceSubset {
  openFile(scope: { sessionId: string; cwd?: string }, path: string, title?: string): void
  getSnapshot(): { sessionId?: string }
  registerFileViewer?(descriptor: {
    id: string
    title?: string
    exts: readonly string[]
    priority?: number
    fetchStrategy: string
    component: (props: { path: string; title: string }) => unknown
  }): () => void
}

/** dsh-client-runtime `ctx.sessions` 的结构子集（定位/新建会话所需部分）。 */
export interface ClientSessionsSubset {
  open(id: string): void
  /** 会话列表快照（含 current 与 byId 标题索引）。 */
  readonly list: { getSnapshot(): { current: string | undefined; byId: Record<string, { title?: string; displayTitle?: string }> } }
  /** 解析会话的 Agent 作用域上下文（供 conversation.input.for 使用）。 */
  scope(id: string): unknown
}

/** dsh-client-runtime `ctx.workspaces` 的结构子集（新建提案会话所需部分）。 */
export interface ClientWorkspacesSubset {
  startSession(workspaceId?: string): void
}

export type { Context }

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** 由 dsh-better-sidebar 客户端半发布。 */
    betterSidebar: BetterSidebarServiceSubset
    /** dsh-client-runtime 发布的会话服务。 */
    sessions: ClientSessionsSubset
    /** dsh-client-runtime 发布的工作区服务。 */
    workspaces: ClientWorkspacesSubset
  }
}
