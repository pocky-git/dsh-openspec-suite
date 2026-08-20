/**
 * 客户端半与宿主半共享的 wire 类型（/openspec/api/* 的 JSON 信封载荷）。
 */

/** change 目录下的一个可预览产物文件。 */
export interface OpenSpecArtifactFileWire {
  kind: string
  label: string
  path: string
  bytes: number
  mtime: string
}

/** schema.yaml 中定义的一个产物阶段的满足状态。 */
export interface OpenSpecExpectedArtifactWire {
  id: string
  satisfied: boolean
}

/** 提案生命周期状态（与宿主 ChangeStatus 对应）。 */
export type ChangeStatusWire = 'designing' | 'ready' | 'applying' | 'done' | 'archived'

/** 一个变更提案及其产物/任务进度。 */
export interface OpenSpecChangeWire {
  name: string
  status: ChangeStatusWire
  tasks: { done: number; total: number }
  files: OpenSpecArtifactFileWire[]
  expected: OpenSpecExpectedArtifactWire[]
  /** 归档日期（YYYY-MM-DD；仅已归档）。 */
  archivedAt?: string
}

/** overview 返回的一个已导入项目。 */
export interface ProjectWire {
  path: string
  name: string
  workspaceId: string
  /** 该工作区下已登记的会话（新建/最早在前）。 */
  sessionIds: string[]
  stillValid: boolean
  changes: OpenSpecChangeWire[]
  /** 提案名 → 绑定会话 id（来自提案目录内的 .dsh-session 标记）。 */
  changeSessions: Record<string, string>
}

/** scanAndImportAll 的结果。 */
export interface ImportAllResult {
  root: string
  count: number
  imported: string[]
  existing: string[]
  failed: Array<{ path: string; message: string }>
}

/** 应用内目录浏览器的状态。 */
export interface PickerState {
  open: boolean
  path: string
  entries: Array<{ name: string; path: string }>
  error: string
}
