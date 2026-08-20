/**
 * dsh-openspec-suite 宿主半入口。
 *
 * 挂在 `/openspec/api/*` 下的 OpenSpec 管理 API（仅限 loopback 的信任
 * 栅栏）：文件夹扫描、工作区导入、按项目统计提案进度。
 * 具体实现按功能拆分在 ./host/ 下：
 * - scan.ts                    OpenSpec 项目发现（目录扫描）
 * - changes.ts                 提案进度（状态/产物/任务解析）
 * - prefs.ts                   设置命名空间与偏好读写
 * - change-session-bindings.ts 提案 → 会话绑定（标记文件 + 对账）
 * - api-handlers.ts            各 API 方法的业务实现
 * - routes.ts                  HTTP 路由注册与分发
 * - wire.ts                    传输层辅助（栅栏/信封/校验）
 */

import z from 'schemastery'
import type { Context } from './context-types.ts'
import { registerApiRoutes } from './host/api/routes.ts'
import { MAX_SCAN_DEPTH } from './host/openspec/scan.ts'

export { scanOpenspecProjects, type OpenSpecProject } from './host/openspec/scan.ts'
export { readProjectChanges, type ChangeStatus, type OpenSpecChange, type OpenSpecArtifactFile, type OpenSpecExpectedArtifact } from './host/openspec/changes.ts'

/** 插件标识，用于 cordis.yml 的行。 */
export const name = 'dsh-openspec-suite'

/** 挂载前需要的服务。 */
export const inject = ['webServer', 'sessions', 'workspaceRegistry']

export interface Config { scanDepth?: number }

export const Config: z<Config> = z.object({
  scanDepth: z.number().step(1).min(1).max(8).default(MAX_SCAN_DEPTH),
})

export function apply(ctx: Context, config: Config): void {
  registerApiRoutes(ctx, config.scanDepth ?? MAX_SCAN_DEPTH)
}
