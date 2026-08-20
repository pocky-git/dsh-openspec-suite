/**
 * 提案进度：读取 openspec 项目的 changes/ 目录，按自定义 schema
 * 汇总每个提案的生命周期状态、产物清单与任务勾选进度。
 */

import { join } from 'node:path'
import { promises as fsp } from 'node:fs'

/**
 * 提案生命周期状态：
 * - designing 方案设计中（schema 产物尚有缺口）
 * - ready     待实施（产物齐全、任务未开工）
 * - applying  实施中（任务有勾选进度但未完成）
 * - done      待归档（任务全部完成、尚未归档）
 * - archived  已归档
 */
export type ChangeStatus = 'designing' | 'ready' | 'applying' | 'done' | 'archived'

/** 一个变更提案及其产物/任务进度。 */
export interface OpenSpecChange {
  name: string
  /** 生命周期状态。 */
  status: ChangeStatus
  /** tasks.md 中已勾选 / 总复选框数（文件缺失时为 0/0）。 */
  tasks: { done: number; total: number }
  /** 产物文件清单（仅 schema.yaml 定义且已生成的产物），按 schema 顺序排列。 */
  files: OpenSpecArtifactFile[]
  /** 本项目 schema.yaml 定义的期望产物，用于展示“缺失产物”。 */
  expected: OpenSpecExpectedArtifact[]
  /** 归档时间（ISO 日期，从归档目录名 YYYY-MM-DD-<name> 解析；仅已归档）。 */
  archivedAt?: string
}

/** schema.yaml 中定义的一个产物阶段。 */
export interface OpenSpecExpectedArtifact {
  /** schema 里的 artifact id（如 brainstorm / proposal / test-cases）。 */
  id: string
  /** 该产物在该 change 目录下是否已存在（按 generates glob 匹配）。 */
  satisfied: boolean
}

/** change 目录下的一个可预览产物文件。 */
export interface OpenSpecArtifactFile {
  /** 产物类别：schema 产物 id。 */
  kind: string
  /** 展示名：proposal.md / design.html / specs/<capability>/spec.md。 */
  label: string
  /** 绝对路径（用于 file.read 预览）。 */
  path: string
  /** 字节大小。 */
  bytes: number
  /** 最后修改时间（ISO 字符串）。 */
  mtime: string
}

/** schema.yaml 中定义的一个产物阶段（id + generates glob）。 */
interface SchemaArtifact {
  id: string
  generates: string
}

/** 读取文件 stat 摘要；文件不可读时返回 undefined。 */
async function statFile(file: string): Promise<{ bytes: number; mtime: string } | undefined> {
  try {
    const stat = await fsp.stat(file)
    if (!stat.isFile()) return undefined
    return { bytes: stat.size, mtime: stat.mtime.toISOString() }
  } catch {
    return undefined
  }
}

/** 解析 tasks.md 的复选框进度。 */
function parseTasks(content: string): { done: number; total: number } {
  let done = 0
  let total = 0
  for (const match of content.matchAll(/^\s*[-*]\s+\[( |x|X)\]/gm)) {
    total += 1
    if (match[1] !== ' ') done += 1
  }
  return { done, total }
}

/**
 * 读取项目自定义 schema（openspec/schemas 下任意子目录的 schema.yaml，
 * 取第一个存在的），抽取 artifacts 列表（id + generates glob）。
 * 不存在/解析失败返回 []。
 */
async function readSchemaArtifacts(projectDir: string): Promise<SchemaArtifact[]> {
  let names: string[]
  try {
    names = await fsp.readdir(join(projectDir, 'openspec', 'schemas'))
  } catch {
    return []
  }
  for (const schemaDirName of names.sort()) {
    let content: string
    try {
      content = await fsp.readFile(join(projectDir, 'openspec', 'schemas', schemaDirName, 'schema.yaml'), 'utf8')
    } catch {
      continue
    }
    // 极简 YAML 抽取：只找 "artifacts:" 顶层级下每个 "- id: X" 条目的
    // id 与 generates 字段（generates 可能带引号）。schema.yaml 是
    // 插件只读数据，不值得引入完整 yaml 解析依赖。
    const result: SchemaArtifact[] = []
    let inArtifacts = false
    let pendingId: string | null = null
    for (const rawLine of content.split(/\r?\n/u)) {
      if (/^\S/u.test(rawLine)) inArtifacts = rawLine.trimEnd() === 'artifacts:'
      if (!inArtifacts) continue
      const idMatch = /^\s*-\s+id:\s*(\S+)\s*$/u.exec(rawLine)
      if (idMatch !== null) {
        if (pendingId !== null) result.push({ id: pendingId, generates: '' })
        pendingId = idMatch[1]!
        continue
      }
      const genMatch = /^\s*generates:\s*['"]?([^'"\n]+?)['"]?\s*$/u.exec(rawLine)
      if (genMatch !== null && pendingId !== null) {
        result.push({ id: pendingId, generates: genMatch[1]!.trim() })
        pendingId = null
      }
    }
    if (pendingId !== null) result.push({ id: pendingId, generates: '' })
    if (result.length > 0) return result
  }
  return []
}

/** 简化 glob → RegExp（支持 ** 与 *，用于匹配 generates 模式）。 */
function globToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '\u0000')
    .replace(/\*/g, '[^/]*')
    .replace(/\u0000/g, '.*')
  return new RegExp(`^${escaped}$`, 'u')
}

/** 判断相对路径（change 目录内）是否匹配某个 generates 模式。 */
function matchesGlob(relPath: string, generates: string): boolean {
  if (generates === '') return false
  return globToRegExp(generates).test(relPath)
}

interface ListedFile {
  rel: string
  path: string
  stat: { bytes: number; mtime: string }
}

/**
 * 递归列举 change 目录下全部产物文件（含子目录如 specs/<cap>/spec.md）。
 * 隐藏文件与 node_modules 除外。
 */
async function listChangeFilesRecursively(changeDir: string, signal?: AbortSignal): Promise<ListedFile[]> {
  const out: ListedFile[] = []
  const walk = async (dir: string, prefix: string): Promise<void> => {
    let entries
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (signal?.aborted) return
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
      const childPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(childPath, `${prefix}${entry.name}/`)
      } else {
        const stat = await statFile(childPath)
        if (stat !== undefined) out.push({ rel: `${prefix}${entry.name}`, path: childPath, stat })
      }
    }
  }
  await walk(changeDir, '')
  out.sort((a, b) => a.rel.localeCompare(b.rel))
  return out
}

/** 读取一个 change 目录并汇总为进度摘要。 */
async function readChange(changeDir: string, changeName: string, schemaArtifacts: SchemaArtifact[], signal?: AbortSignal): Promise<OpenSpecChange | null> {
  let tasksProgress = { done: 0, total: 0 }
  const listed = await listChangeFilesRecursively(changeDir, signal)
  if (signal?.aborted) return null
  // schema 产物匹配：把每个文件归到第一个匹配的 artifact id 上。
  // 产物列表只包含 schema.yaml 定义的产物；schema 之外的文件不展示。
  const files: OpenSpecArtifactFile[] = []
  const matchedRels = new Set<string>()
  for (const artifact of schemaArtifacts) {
    for (const { rel, path, stat } of listed) {
      if (matchedRels.has(rel)) continue
      if (matchesGlob(rel, artifact.generates)) {
        matchedRels.add(rel)
        files.push({ kind: artifact.id, label: rel, path, ...stat })
      }
    }
  }
  files.sort((a, b) => {
    const orderA = schemaArtifacts.findIndex((a2) => a2.id === a.kind)
    const orderB = schemaArtifacts.findIndex((b2) => b2.id === b.kind)
    return orderA === orderB ? a.label.localeCompare(b.label) : orderA - orderB
  })
  // schema 期望产物满足状态。
  const expected: OpenSpecExpectedArtifact[] = schemaArtifacts.map((artifact) => ({
    id: artifact.id,
    satisfied: listed.some(({ rel }) => matchesGlob(rel, artifact.generates)),
  }))
  // tasks.md 勾选进度（tasks 产物可能是 tasks.md 或其他自定义名）。
  const tasksArtifact = schemaArtifacts.find((a) => a.id === 'tasks')
  const tasksFile = tasksArtifact !== undefined
    ? listed.find(({ rel }) => matchesGlob(rel, tasksArtifact.generates))
    : undefined
  if (tasksFile !== undefined) {
    try {
      tasksProgress = parseTasks(await fsp.readFile(tasksFile.path, 'utf8'))
    } catch { /* tasks 文件读不出来按 0/0 处理 */ }
  }
  // 状态推导（归档由 readProjectChanges 在目录层面判定并覆写）。
  const allSatisfied = expected.every((e) => e.satisfied)
  let status: ChangeStatus
  if (tasksProgress.total > 0 && tasksProgress.done >= tasksProgress.total) status = 'done'
  else if (tasksProgress.done > 0) status = 'applying'
  else if (allSatisfied) status = 'ready'
  else status = 'designing'
  return { name: changeName, status, tasks: tasksProgress, files, expected }
}

/** 汇总一个 openspec 项目的所有 change（活跃 + 已归档）。 */
export async function readProjectChanges(projectDir: string, signal?: AbortSignal): Promise<OpenSpecChange[]> {
  const changesDir = join(projectDir, 'openspec', 'changes')
  let entries
  try {
    entries = await fsp.readdir(changesDir, { withFileTypes: true })
  } catch {
    return []
  }
  const schemaArtifacts = await readSchemaArtifacts(projectDir)
  const changes: OpenSpecChange[] = []
  for (const entry of entries) {
    if (signal?.aborted) break
    if (!entry.isDirectory()) continue
    if (entry.name === 'archive') {
      // 归档区：openspec archive 的目录名惯例是 YYYY-MM-DD-<name>。
      const archiveDir = join(changesDir, 'archive')
      let archivedEntries
      try {
        archivedEntries = await fsp.readdir(archiveDir, { withFileTypes: true })
      } catch {
        continue
      }
      for (const archived of archivedEntries) {
        if (signal?.aborted) break
        if (!archived.isDirectory()) continue
        const dateMatch = /^(\d{4}-\d{2}-\d{2})-(.+)$/u.exec(archived.name)
        const change = await readChange(join(archiveDir, archived.name), dateMatch?.[2] ?? archived.name, schemaArtifacts, signal)
        if (change !== null) {
          change.status = 'archived'
          if (dateMatch !== null) change.archivedAt = dateMatch[1]
          changes.push(change)
        }
      }
      continue
    }
    const change = await readChange(join(changesDir, entry.name), entry.name, schemaArtifacts, signal)
    if (change !== null) changes.push(change)
  }
  // 归档时间倒序（最新在前），活跃提案保持目录序。
  changes.sort((a, b) => {
    if (a.status !== 'archived' && b.status !== 'archived') return 0
    if (a.status !== 'archived') return -1
    if (b.status !== 'archived') return 1
    return (b.archivedAt ?? '').localeCompare(a.archivedAt ?? '')
  })
  return changes
}
