/**
 * dsh-openspec-suite 宿主半。
 *
 * 挂在 `/openspec/api/*` 下的 OpenSpec 管理 API（仅限 loopback 的信任
 * 栅栏）：文件夹扫描、工作区导入、按项目统计提案进度。
 */

import { basename, join } from 'node:path'
import { promises as fsp } from 'node:fs'
import type { Context } from './context-types.ts'

/** 插件标识，用于 cordis.yml 的行。 */
export const name = 'dsh-openspec-suite'

/** 挂载前需要的服务。 */
export const inject = ['webServer', 'sessions', 'workspaceRegistry']

/** 信任栅栏：只允许 loopback 浏览器来源。 */
function isTrustedApiRequest(hostHeader: string | undefined): boolean {
  if (hostHeader === undefined) return false
  const hostname = hostHeader.split(':')[0]!.toLowerCase()
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]'
}

// ── OpenSpec 项目发现 ───────────────────────────────────────────────────────

/** 一个被探测到的 OpenSpec 项目。 */
export interface OpenSpecProject {
  /** 项目根目录（绝对路径）。 */
  path: string
  /** 目录名。 */
  name: string
  /** 根目录本身是否就是 openspec 项目（而非更深层嵌套的）。 */
  root: boolean
}

const MAX_SCAN_DEPTH = 4
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.venv', 'venv', '__pycache__', 'target', 'openspec'])

/** 判断 `dir` 是否含有带 `changes/` 子目录的 `openspec/` 目录。 */
async function isOpenspecProject(dir: string): Promise<boolean> {
  try {
    const stat = await fsp.stat(join(dir, 'openspec', 'changes'))
    return stat.isDirectory()
  } catch {
    return false
  }
}

/**
 * 枚举 `rootDir` 下最多 `maxDepth` 层的候选目录。
 * 使用递归 readdir（只返回名字）再对每个候选用 stat() 复核，
 * 因此从不信任 Dirent 的类型字段（在 Electron 宿主里
 * `entry.isDirectory()` 已被证明不可靠）。
 */
async function listSubdirectories(rootDir: string, maxDepth: number, signal?: AbortSignal): Promise<string[]> {
  const results: string[] = []
  const queue: Array<{ dir: string; depth: number }> = [{ dir: rootDir, depth: 0 }]
  while (queue.length > 0) {
    if (signal?.aborted) break
    const { dir, depth } = queue.shift()!
    if (depth >= maxDepth) continue
    let names: string[]
    try {
      names = await fsp.readdir(dir)
    } catch {
      continue
    }
    for (const name of names) {
      if (signal?.aborted) break
      if (SKIP_DIRS.has(name) || name.startsWith('.')) continue
      const child = join(dir, name)
      let stat
      try {
        stat = await fsp.stat(child)
      } catch {
        continue
      }
      if (!stat.isDirectory()) continue
      results.push(child)
      queue.push({ dir: child, depth: depth + 1 })
    }
  }
  return results
}

/**
 * 扫描 `rootDir`（含其自身）最多 `maxDepth` 层，找出所有包含
 * `openspec/changes/` 的目录。
 */
export async function scanOpenspecProjects(rootDir: string, signal?: AbortSignal, maxDepth = MAX_SCAN_DEPTH): Promise<OpenSpecProject[]> {
  const found: OpenSpecProject[] = []
  const rootName = basename(rootDir) || rootDir
  if (await isOpenspecProject(rootDir)) {
    found.push({ path: rootDir, name: rootName, root: true })
  }
  for (const child of await listSubdirectories(rootDir, maxDepth, signal)) {
    if (await isOpenspecProject(child)) {
      found.push({ path: child, name: basename(child), root: child === rootDir })
    }
  }
  return found
}

// ── 提案进度 ────────────────────────────────────────────────────────────────

/** 一个变更提案及其产物/任务进度。 */
export interface OpenSpecChange {
  name: string
  /** 已存在的产物：proposal / design / specs / tasks。 */
  artifacts: { proposal: boolean; design: boolean; specs: boolean; tasks: boolean }
  /** tasks.md 中已勾选 / 总复选框数（文件缺失时为 0/0）。 */
  tasks: { done: number; total: number }
  /** 产物文件清单（含 specs/ 下的能力规格文件），按固定产物顺序排列。 */
  files: OpenSpecArtifactFile[]
  /** 本项目 schema.yaml 定义的期望产物（存在时），用于展示"缺失产物"。 */
  expected: OpenSpecExpectedArtifact[]
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
  /** 产物类别：schema 产物 id，或 'file'（schema 之外/未知来源的文件）。 */
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
async function readSchemaArtifacts(projectDir: string): Promise<Array<{ id: string; generates: string }>> {
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
    const result: Array<{ id: string; generates: string }> = []
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
  // "specs/**/*.md" 应同时匹配 "specs/a/spec.md"（** 跨目录）；
  // 也接受目录前缀式匹配（specs/x → specs/x/...）
  return globToRegExp(generates).test(relPath)
}

/**
 * 递归列举 change 目录下全部产物文件（含子目录如 specs/<cap>/spec.md）。
 * 隐藏文件与 node_modules 除外。
 */
async function listChangeFilesRecursively(changeDir: string, signal?: AbortSignal): Promise<Array<{ rel: string; path: string; stat: { bytes: number; mtime: string } }>> {
  const out: Array<{ rel: string; path: string; stat: { bytes: number; mtime: string } }> = []
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
async function readChange(changeDir: string, changeName: string, schemaArtifacts: Array<{ id: string; generates: string }>, signal?: AbortSignal): Promise<OpenSpecChange | null> {
  const artifacts = { proposal: false, design: false, specs: false, tasks: false }
  let tasksProgress = { done: 0, total: 0 }
  const listed = await listChangeFilesRecursively(changeDir, signal)
  if (signal?.aborted) return null
  // schema 产物匹配：把每个文件归到第一个匹配的 artifact id 上。
  const kindByRel = new Map<string, string>()
  for (const { rel } of listed) {
    for (const artifact of schemaArtifacts) {
      if (matchesGlob(rel, artifact.generates)) {
        kindByRel.set(rel, artifact.id)
        break
      }
    }
  }
  const files: OpenSpecArtifactFile[] = listed.map(({ rel, path, stat }) => ({
    kind: kindByRel.get(rel) ?? 'file',
    label: rel,
    path,
    ...stat,
  }))
  // 经典四产物布尔值（与 schema 无关，保留给旧 UI/进度计算）。
  for (const { rel, path } of listed) {
    if (rel === 'proposal.md') artifacts.proposal = true
    else if (rel === 'design.md' || rel === 'design.html') artifacts.design = true
    else if (rel === 'tasks.md') {
      artifacts.tasks = true
      try {
        tasksProgress = parseTasks(await fsp.readFile(path, 'utf8'))
      } catch { /* tasks.md 读不出来仍视为已存在 */ }
    } else if (rel.startsWith('specs/') && rel.endsWith('.md')) artifacts.specs = true
  }
  // schema 期望产物满足状态。
  const expected: OpenSpecExpectedArtifact[] = schemaArtifacts.map((artifact) => ({
    id: artifact.id,
    satisfied: listed.some(({ rel }) => matchesGlob(rel, artifact.generates)),
  }))
  return { name: changeName, artifacts, tasks: tasksProgress, files, expected }
}

/** 汇总一个 openspec 项目的所有活跃（未归档）change。 */
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
    if (!entry.isDirectory() || entry.name === 'archive') continue
    const change = await readChange(join(changesDir, entry.name), entry.name, schemaArtifacts, signal)
    if (change !== null) changes.push(change)
  }
  return changes
}

// ── 设置 ────────────────────────────────────────────────────────────────────

import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import z from 'schemastery'

const PREFS_NS = settingsNamespace('dsh-openspec-suite')

const PrefsSchema = z.object({
  /** 已导入的项目根目录（绝对路径），按导入顺序。 */
  projects: z.array(z.string()).default([]),
  /** 最近一次扫描的根目录，用于在导入视图中预填。 */
  lastScanRoot: z.string().default(''),
})

interface Prefs {
  projects: string[]
  lastScanRoot: string
}

// ── 传输层辅助 ──────────────────────────────────────────────────────────────

/** 可预览的文件扩展名（产物常见类型；.html 通过 iframe 原始路由预览）。 */
const PREVIEWABLE_EXTENSIONS = new Set(['.md', '.html', '.htm', '.yaml', '.yml', '.json', '.txt', '.js', '.css'])

/** 判断路径是否为可预览类型。 */
function isPreviewablePath(filePath: string): boolean {
  const dot = filePath.lastIndexOf('.')
  if (dot === -1) return false
  return PREVIEWABLE_EXTENSIONS.has(filePath.slice(dot).toLowerCase())
}

/** 原始路由的 content-type。 */
function contentTypeFor(filePath: string): string {
  const dot = filePath.lastIndexOf('.')
  const ext = dot === -1 ? '' : filePath.slice(dot).toLowerCase()
  if (ext === '.html' || ext === '.htm') return 'text/html; charset=utf-8'
  if (ext === '.json') return 'application/json; charset=utf-8'
  if (ext === '.yaml' || ext === '.yml') return 'text/yaml; charset=utf-8'
  return 'text/plain; charset=utf-8'
}

/**
 * 校验一个文件是否在某个已注册工作区的 openspec/ 目录内、存在、
 * 且小于 2MB。返回 stat 或 error（直接可用于 writeError）。
 */
async function checkPreviewableFile(
  ctx: Context,
  filePath: string,
): Promise<{ stat?: { bytes: number; mtime: string }; error?: { code: string; message: string; status: number } }> {
  const workspaces = ctx.workspaceRegistry.list()
  const inside = workspaces.some((ws) => filePath.startsWith(join(ws.path, 'openspec') + '/'))
  if (!inside) {
    return { error: { code: 'forbidden', message: 'path is outside any registered workspace openspec/ directory', status: 403 } }
  }
  let stat
  try {
    stat = await fsp.stat(filePath)
  } catch {
    return { error: { code: 'not-found', message: 'file not found', status: 404 } }
  }
  if (!stat.isFile()) return { error: { code: 'not-found', message: 'not a file', status: 404 } }
  // JS 依赖（如 mermaid.min.js）可能较大；静态产物上限 2MB，依赖文件 10MB。
  const limit = filePath.endsWith('.js') || filePath.endsWith('.css') ? 10_000_000 : 2_000_000
  if (stat.size > limit) return { error: { code: 'too-large', message: `file larger than ${limit} bytes`, status: 413 } }
  return { stat: { bytes: stat.size, mtime: stat.mtime.toISOString() } }
}

function writeJson(res: unknown, status: number, body: unknown): void {
  const r = res as { setHeader(k: string, v: string): void; statusCode: number; end(body: string): void }
  r.setHeader('content-type', 'application/json')
  r.statusCode = status
  r.end(JSON.stringify(body))
}

function writeOk(res: unknown, value: unknown): void {
  writeJson(res, 200, { ok: true, value })
}

function writeError(res: unknown, code: string, message: string, status = 400): void {
  writeJson(res, status, { ok: false, error: { code, message } })
}

interface WireRequest {
  method?: string
  body?: unknown
}

/** 解析单个请求的 JSON body，带大小上限。 */
async function readJsonBody(req: WireRequest): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req as AsyncIterable<Buffer | string>) {
    const buf = typeof chunk === 'string' ? Buffer.from(chunk) : chunk
    size += buf.length
    if (size > 1_000_000) throw new Error('payload too large')
    chunks.push(buf)
  }
  if (chunks.length === 0) return {}
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>
}

// ── 插件 ────────────────────────────────────────────────────────────────────

export interface Config { scanDepth?: number }

export const Config: z<Config> = z.object({
  scanDepth: z.number().step(1).min(1).max(8).default(MAX_SCAN_DEPTH),
})

export function apply(ctx: Context, config: Config): void {
  ctx.inject(['settings'], (sctx) => {
    const scope = sctx.settings.register(PREFS_NS, PrefsSchema) as unknown as {
      get(): Prefs
      watch(callback: (next: Prefs) => void): () => void
    }
    const readPrefs = (): Prefs => scope.get()
    const updatePrefs = async (patch: Partial<Prefs>): Promise<Prefs> => {
      await sctx.settings.update(PREFS_NS, patch)
      return readPrefs()
    }

    const requireString = (body: Record<string, unknown>, key: string): string => {
      const value = body[key]
      if (typeof value !== 'string' || value.length === 0) throw new Error(`${key} must be a non-empty string`)
      return value
    }

    ctx.effect(() => ctx.webServer.register({
      kind: 'prefix',
      path: '/openspec/api',
      handler: async (req, res) => {
        if (!isTrustedApiRequest(req.headers?.host)) {
          writeError(res, 'forbidden', 'forbidden', 403)
          return
        }
        const url = new URL(req.url ?? '/', 'http://localhost')
        // GET /openspec/api/raw/<wsId>/<openspec 内相对路径> —— 原始文件
        // 路由，供 iframe 预览 design.html 等交互产物。把路径编进 URL
        // path（而非 query），iframe 内的相对引用（../../mermaid.min.js）
        // 会被浏览器相对此 URL 正确解析到同一路由下的真实文件位置。
        if (req.method === 'GET' && url.pathname.startsWith('/openspec/api/raw/')) {
          const rest = url.pathname.slice('/openspec/api/raw/'.length)
          const slash = rest.indexOf('/')
          if (slash === -1) { writeError(res, 'bad-request', 'missing path', 400); return }
          const wsId = decodeURIComponent(rest.slice(0, slash))
          const relPath = decodeURIComponent(rest.slice(slash + 1))
          // wsId 可能是注册表 id，也可能是 btoa(projectPath)（客户端
          // 构造 URL 时未必知道注册表 id，直接用路径编码定位工作区）。
          const byId = ctx.workspaceRegistry.list().find((w) => w.id === wsId)
          let ws = byId
          if (ws === undefined) {
            try {
              const decodedPath = Buffer.from(wsId, 'base64').toString('utf8')
              ws = ctx.workspaceRegistry.list().find((w) => w.path === decodedPath)
            } catch { /* 非法 base64 就当找不到 */ }
          }
          if (ws === undefined) { writeError(res, 'not-found', 'unknown workspace', 404); return }
          const filePath = join(ws.path, 'openspec', relPath)
          // 栅栏：解析后必须仍位于该工作区 openspec/ 之下（防 .. 逃逸）。
          if (!filePath.startsWith(join(ws.path, 'openspec') + '/')) {
            writeError(res, 'forbidden', 'path escapes openspec/ directory', 403)
            return
          }
          if (!isPreviewablePath(filePath)) {
            writeError(res, 'forbidden', 'file type not previewable', 403)
            return
          }
          const check = await checkPreviewableFile(ctx, filePath)
          if (check.error !== undefined) { writeError(res, check.error.code, check.error.message, check.error.status); return }
          const content = await fsp.readFile(filePath)
          const r = res as { setHeader(k: string, v: string): void; statusCode: number; end(body: unknown): void }
          r.setHeader('content-type', contentTypeFor(filePath))
          r.statusCode = 200
          r.end(content)
          return
        }
        const method = url.pathname.replace(/^\/openspec\/api\//u, '')
        try {
          if (method === 'prefs.get') {
            writeOk(res, readPrefs())
            return
          }
          const body = await readJsonBody(req)
          switch (method) {
            case 'dir.list': {
              // 供导入选择器使用的、支持浏览能力的目录列表
              const path = typeof body.path === 'string' && body.path !== '' ? body.path : undefined
              const picker = ctx.get('directoryPicker')
              const capability = picker?.capability()
              if (picker === undefined || capability === undefined || capability.kind !== 'browse') {
                writeError(res, 'picker-unavailable', 'directory browsing unavailable on this host', 501)
                return
              }
              const listing = await capability.list(path)
              writeOk(res, {
                path: listing.path,
                home: listing.home,
                ancestors: listing.ancestors,
                entries: listing.entries.filter((entry) => !entry.hidden),
                truncated: listing.truncated ?? false,
              })
              return
            }
            case 'pick': {
              // 通过宿主 directoryPicker 接缝做一次性的系统文件夹选择；
              // 仅支持浏览的宿主返回 501，客户端降级为应用内目录浏览器。
              const picker = ctx.get('directoryPicker')
              const capability = picker?.capability()
              if (picker === undefined || capability === undefined) {
                writeError(res, 'picker-unavailable', 'directory picker unavailable on this host', 501)
                return
              }
              if (capability.kind !== 'native') {
                writeError(res, 'pick-unsupported', 'host picker is browse-only; use the in-app browser', 501)
                return
              }
              // IncomingMessage 在 body 读完后不提供 abort signal，
              // 所以选择器按自己的生命周期运行；客户端导航离开时
              // 直接忽略返回的拾取结果即可。
              const path = await capability.pick(new AbortController().signal)
              writeOk(res, { path: path ?? null })
              return
            }
            case 'diag': {
              // 临时诊断接口：为什么父目录扫描什么都找不到？
              const dir = requireString(body, 'path')
              const report: Record<string, unknown> = { dir }
              try {
                const stat = await fsp.stat(dir)
                report.stat = { isDirectory: stat.isDirectory(), mode: stat.mode }
              } catch (error) {
                report.statError = error instanceof Error ? error.message : String(error)
              }
              try {
                const entries = await fsp.readdir(dir, { withFileTypes: true })
                report.entryCount = entries.length
                report.firstEntries = entries.slice(0, 8).map((entry) => ({
                  name: entry.name,
                  isDirectory: entry.isDirectory(),
                  isSymbolicLink: entry.isSymbolicLink(),
                }))
                // 按扫描的同样方式探测一个指定名字的子目录（或第一个可扫描目录）
                const wanted = typeof body.probeName === 'string' && body.probeName !== '' ? body.probeName : undefined
                const probe = entries.find((entry) => entry.isDirectory() && !SKIP_DIRS.has(entry.name) && (wanted === undefined || entry.name === wanted))
                if (probe !== undefined) {
                  const child = join(dir, probe.name)
                  report.probe = { name: probe.name, path: child, isOpenspec: await isOpenspecProject(child) }
                  try {
                    const childStat = await fsp.stat(child)
                    report.probe.statIsDirectory = childStat.isDirectory()
                  } catch (error) {
                    report.probe.statError = error instanceof Error ? error.message : String(error)
                  }
                }
              } catch (error) {
                report.readdirError = error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error)
              }
              // 重新运行一遍完全相同的扫描路径并追踪其行为
              try {
                const subdirs = await listSubdirectories(dir, MAX_SCAN_DEPTH)
                report.subdirCount = subdirs.length
                report.subdirSample = subdirs.slice(0, 12)
                const matches = []
                for (const child of subdirs) {
                  if (await isOpenspecProject(child)) matches.push(child)
                }
                report.scanMatches = matches
              } catch (error) {
                report.scanTraceError = error instanceof Error ? `${error.code ?? ''} ${error.message}\n${error.stack ?? ''}` : String(error)
              }
              writeOk(res, report)
              return
            }
            case 'scanAndImportAll': {
              // （递归）扫描选定的根目录并导入其下的所有 openspec
              // 项目——选定的文件夹本身不
              // 需要是项目。
              const rootDir = requireString(body, 'path')
              const rootStat = await fsp.stat(rootDir).catch(() => undefined)
              if (rootStat === undefined || !rootStat.isDirectory()) {
                writeError(res, 'not-a-directory', `${rootDir} is not a readable directory`)
                return
              }
              const projects = await scanOpenspecProjects(rootDir)
              const imported: string[] = []
              const existing: string[] = []
              const failed: Array<{ path: string; message: string }> = []
              for (const project of projects) {
                try {
                  const alreadyWorkspace = ctx.workspaceRegistry.list().some((ws) => ws.path === project.path)
                  if (!alreadyWorkspace) await ctx.workspaceRegistry.create(project.path, basename(project.path) || project.path)
                  const prefs = readPrefs()
                  if (!prefs.projects.includes(project.path)) {
                    await updatePrefs({ ...prefs, projects: [...prefs.projects, project.path] })
                  }
                  ;(alreadyWorkspace ? existing : imported).push(project.path)
                } catch (error) {
                  failed.push({ path: project.path, message: error instanceof Error ? error.message : String(error) })
                }
              }
              await updatePrefs({ ...readPrefs(), lastScanRoot: rootDir })
              writeOk(res, { root: rootDir, count: projects.length, imported, existing, failed, projects })
              return
            }
            case 'scan': {
              const rootDir = requireString(body, 'path')
              const projects = await scanOpenspecProjects(rootDir)
              await updatePrefs({ ...readPrefs(), lastScanRoot: rootDir })
              // 找不到项目时附带诊断信息，让"为什么没探测到我的
              // 项目"可以直接从传输层回答
              let diag: Record<string, unknown> | undefined
              if (projects.length === 0) {
                diag = { node: process.version }
                try {
                  const entries = await fsp.readdir(rootDir, { withFileTypes: true })
                  diag.entryCount = entries.length
                  diag.dirNames = entries.filter((entry) => entry.isDirectory()).slice(0, 10).map((entry) => entry.name)
                  diag.readdirWorks = true
                } catch (error) {
                  diag.readdirWorks = false
                  diag.readdirError = error instanceof Error ? `${error.code ?? ''} ${error.message}` : String(error)
                }
              }
              writeOk(res, { root: rootDir, projects, ...(diag !== undefined ? { diag } : {}) })
              return
            }
            case 'import': {
              const rootDir = requireString(body, 'path')
              const stat = await fsp.stat(join(rootDir, 'openspec', 'changes')).catch(() => undefined)
              if (stat === undefined || !stat.isDirectory()) {
                writeError(res, 'not-openspec', `${rootDir} is not an OpenSpec project (openspec/changes missing)`)
                return
              }
              const existing = ctx.workspaceRegistry.list().find((ws) => ws.path === rootDir)
              if (existing === undefined) await ctx.workspaceRegistry.create(rootDir, basename(rootDir) || rootDir)
              const prefs = readPrefs()
              if (!prefs.projects.includes(rootDir)) {
                await updatePrefs({ ...prefs, projects: [...prefs.projects, rootDir] })
              }
              writeOk(res, { imported: rootDir, workspaceExisted: existing !== undefined })
              return
            }
            case 'remove': {
              const rootDir = requireString(body, 'path')
              // 同时从偏好索引和工作区注册表中移除，这样在这里
              // 删除项目也会把它从侧边栏去掉（反向同步由 overview
              // 的对账逻辑处理）。
              const prefs = readPrefs()
              await updatePrefs({ ...prefs, projects: prefs.projects.filter((p) => p !== rootDir) })
              const ws = ctx.workspaceRegistry.list().find((w) => w.path === rootDir)
              if (ws !== undefined) await ctx.workspaceRegistry.delete(ws.id)
              writeOk(res, { removed: rootDir, workspaceDeleted: ws !== undefined })
              return
            }
            case 'overview': {
              // 权威数据源 = 工作区注册表，让 OpenSpec 项目和侧边栏
              // 工作区保持一致：任一侧增删的工作区都会在这里反映。
              const workspaces = ctx.workspaceRegistry.list()
              const all = await Promise.all(workspaces.map(async (ws) => ({
                ws,
                changes: await readProjectChanges(ws.path),
                isOpenspec: await isOpenspecProject(ws.path),
              })))
              const openspecProjects = all
                .filter((entry) => entry.isOpenspec)
                .map((entry) => ({
                  path: entry.ws.path,
                  name: entry.ws.title || basename(entry.ws.path) || entry.ws.path,
                  stillValid: entry.isOpenspec,
                  changes: entry.changes,
                }))
              // 把偏好对账成注册表路径的忠实缓存，这样从侧边栏一侧
              // 删除的工作区在这里也会消失。
              const registryPaths = new Set(workspaces.map((ws) => ws.path))
              const prefs = readPrefs()
              const reconciled = prefs.projects.filter((p) => registryPaths.has(p))
              for (const entry of all) {
                if (entry.isOpenspec && !reconciled.includes(entry.ws.path)) reconciled.push(entry.ws.path)
              }
              if (reconciled.length !== prefs.projects.length || reconciled.some((p, i) => p !== prefs.projects[i])) {
                await updatePrefs({ ...prefs, projects: reconciled })
              }
              writeOk(res, { projects: openspecProjects })
              return
            }
            case 'file.read': {
              // 读取一个产物文件的内容用于预览。安全栅栏：
              // 1. 必须位于某个已注册工作区的 openspec/ 目录之内；
              // 2. 必须是受限预览类型（md/html/yaml/json/txt）；
              // 3. 大小上限 2MB。
              const filePath = requireString(body, 'path')
              if (!isPreviewablePath(filePath)) {
                writeError(res, 'forbidden', 'file type not previewable', 403)
                return
              }
              const check = await checkPreviewableFile(ctx, filePath)
              if (check.error !== undefined) { writeError(res, check.error.code, check.error.message, check.error.status); return }
              const content = await fsp.readFile(filePath, 'utf8')
              writeOk(res, { path: filePath, bytes: check.stat!.bytes, mtime: check.stat!.mtime, content })
              return
            }
            default:
              writeError(res, 'unknown-method', `unknown method ${method}`, 404)
          }
        } catch (error) {
          writeError(res, 'error', error instanceof Error ? error.message : String(error))
        }
      },
    }))
  })
}
