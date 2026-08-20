/**
 * 提案 → 会话匹配：绑定标记优先，宿主现场对账次之，第一个会话兜底。
 */

import { call } from './api.ts'
import type { ProjectWire } from './types.ts'

/**
 * 从项目会话列表中找出该提案对应的会话：
 * 1. overview 带回的绑定标记（提案目录内 .dsh-session 文件），
 *    绑定仍在本项目会话列表内才有效；
 * 2. overview 数据里没有时（例如提案目录刚出现、总览页还没重新
 *    加载），向宿主查一次 changeSession.get——宿主会先做待绑定
 *    对账再读标记文件；
 * 3. 回退第一个会话（绑定不存在或已失效时）；
 * 4. 没有任何会话则 undefined。
 */
export async function findChangeSession(project: ProjectWire, changeName: string): Promise<string | undefined> {
  if (project.sessionIds.length === 0) return undefined
  const tryBound = (sessionId: string): string | undefined =>
    project.sessionIds.includes(sessionId) ? sessionId : undefined
  const local = project.changeSessions[changeName]
  if (local !== undefined) {
    const hit = tryBound(local)
    if (hit !== undefined) return hit
  }
  // overview 快照里没有有效绑定：让宿主现场对账 + 读标记文件。
  try {
    const result = await call<{ sessionId: string | null }>('changeSession.get', { projectPath: project.path, changeName })
    if (result.sessionId !== null) {
      const hit = tryBound(result.sessionId)
      if (hit !== undefined) return hit
    }
  } catch { /* 宿主查询失败，走兜底 */ }
  return project.sessionIds[0]
}
