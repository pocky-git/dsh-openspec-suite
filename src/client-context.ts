/** 客户端半的 Context 类型增强。 */
import type { Context } from '@deepseek-ai/cordis'

/** dsh-better-sidebar 客户端服务的结构子集（openFile 所需部分）。 */
export interface BetterSidebarServiceSubset {
  openFile(scope: { sessionId: string; cwd?: string }, path: string, title?: string): void
  getSnapshot(): { sessionId?: string }
}

export type { Context }

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** 由 dsh-better-sidebar 客户端半发布；未安装时为 undefined。 */
    betterSidebar?: BetterSidebarServiceSubset
  }
}
