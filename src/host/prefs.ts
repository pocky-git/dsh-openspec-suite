/**
 * 设置命名空间与偏好读写：持久化已导入项目列表与最近扫描目录。
 */

import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import z from 'schemastery'

const PREFS_NS = settingsNamespace('dsh-openspec-suite')

const PrefsSchema = z.object({
  /** 已导入的项目根目录（绝对路径），按导入顺序。 */
  projects: z.array(z.string()).default([]),
  /** 最近一次扫描的根目录，用于在导入视图中预填。 */
  lastScanRoot: z.string().default(''),
})

export interface Prefs {
  projects: string[]
  lastScanRoot: string
}

/** 偏好读取句柄（由宿主 settings 服务支撑；写走 settings.update）。 */
export interface PrefsScope {
  get(): Prefs
}

/** 在 settings 服务就绪的子作用域里创建偏好读取句柄。 */
export function createPrefsScope(settings: { register(ns: string, schema: unknown): unknown }): PrefsScope {
  return settings.register(PREFS_NS, PrefsSchema) as unknown as PrefsScope
}

/** 写入偏好 patch（register 返回的 scope 只能读，写走 settings.update）。 */
export async function updatePrefs(settings: { update(ns: string, patch: Partial<Prefs>): Promise<void> }, patch: Partial<Prefs>): Promise<void> {
  await settings.update(PREFS_NS, patch)
}
