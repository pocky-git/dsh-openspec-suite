/**
 * `/openspec/api/*` 各方法的具体实现（目录浏览/拾取、扫描导入、
 * 移除、总览、文件读取、raw URL、提案会话绑定查询）。
 * 由 routes.ts 的分发器调用。
 */

import { basename, join } from 'node:path'
import { promises as fsp } from 'node:fs'
import type { Context } from '../../context-types.ts'
import { isOpenspecProject, scanOpenspecProjects } from '../openspec/scan.ts'
import { readProjectChanges } from '../openspec/changes.ts'
import type { Prefs } from '../prefs.ts'
import { ChangeSessionBindings } from '../openspec/change-session-bindings.ts'
import { checkPreviewableFile, isPreviewablePath, requireString, writeError, writeOk } from './wire.ts'

export interface ApiRouteContext {
  ctx: Context
  readPrefs: () => Prefs
  writePrefs: (patch: Partial<Prefs>) => Promise<void>
  bindings: ChangeSessionBindings
  /** 目录扫描的最大深度（来自插件 Config.scanDepth）。 */
  scanDepth: number
}

/** GET /dir.list —— 供导入选择器使用的、支持浏览能力的目录列表。 */
export async function handleDirList(api: ApiRouteContext, res: unknown, body: Record<string, unknown>): Promise<void> {
  const { ctx } = api
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
}

/** POST /pick —— 通过宿主 directoryPicker 做一次系统文件夹选择。 */
export async function handlePick(api: ApiRouteContext, res: unknown): Promise<void> {
  const picker = api.ctx.get('directoryPicker')
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
}

/** 把一个项目导入工作区注册表 + 偏好索引（幂等）。 */
async function importProject(api: ApiRouteContext, projectPath: string): Promise<{ workspaceExisted: boolean }> {
  const { ctx } = api
  const existing = ctx.workspaceRegistry.list().find((ws) => ws.path === projectPath)
  if (existing === undefined) await ctx.workspaceRegistry.create(projectPath, basename(projectPath) || projectPath)
  const prefs = api.readPrefs()
  if (!prefs.projects.includes(projectPath)) {
    await api.writePrefs({ ...prefs, projects: [...prefs.projects, projectPath] })
  }
  return { workspaceExisted: existing !== undefined }
}

/** POST /scanAndImportAll —— 递归扫描选定根目录并导入其下所有项目。 */
export async function handleScanAndImportAll(api: ApiRouteContext, res: unknown, body: Record<string, unknown>): Promise<void> {
  const rootDir = requireString(body, 'path')
  const rootStat = await fsp.stat(rootDir).catch(() => undefined)
  if (rootStat === undefined || !rootStat.isDirectory()) {
    writeError(res, 'not-a-directory', `${rootDir} is not a readable directory`)
    return
  }
  const projects = await scanOpenspecProjects(rootDir, undefined, api.scanDepth)
  const imported: string[] = []
  const existing: string[] = []
  const failed: Array<{ path: string; message: string }> = []
  for (const project of projects) {
    try {
      const alreadyWorkspace = api.ctx.workspaceRegistry.list().some((ws) => ws.path === project.path)
      await importProject(api, project.path)
      ;(alreadyWorkspace ? existing : imported).push(project.path)
    } catch (error) {
      failed.push({ path: project.path, message: error instanceof Error ? error.message : String(error) })
    }
  }
  await api.writePrefs({ ...api.readPrefs(), lastScanRoot: rootDir })
  writeOk(res, { root: rootDir, count: projects.length, imported, existing, failed, projects })
}

/** POST /scan —— 只扫描不导入，返回发现的项目列表。 */
export async function handleScan(api: ApiRouteContext, res: unknown, body: Record<string, unknown>): Promise<void> {
  const rootDir = requireString(body, 'path')
  const projects = await scanOpenspecProjects(rootDir, undefined, api.scanDepth)
  await api.writePrefs({ ...api.readPrefs(), lastScanRoot: rootDir })
  writeOk(res, { root: rootDir, projects })
}

/** POST /import —— 导入单个项目目录。 */
export async function handleImport(api: ApiRouteContext, res: unknown, body: Record<string, unknown>): Promise<void> {
  const rootDir = requireString(body, 'path')
  const stat = await fsp.stat(join(rootDir, 'openspec', 'changes')).catch(() => undefined)
  if (stat === undefined || !stat.isDirectory()) {
    writeError(res, 'not-openspec', `${rootDir} is not an OpenSpec project (openspec/changes missing)`)
    return
  }
  const { workspaceExisted } = await importProject(api, rootDir)
  writeOk(res, { imported: rootDir, workspaceExisted })
}

/** POST /remove —— 从偏好索引和工作区注册表中同时移除。 */
export async function handleRemove(api: ApiRouteContext, res: unknown, body: Record<string, unknown>): Promise<void> {
  const rootDir = requireString(body, 'path')
  // 同时从偏好索引和工作区注册表中移除，这样在这里
  // 删除项目也会把它从侧边栏去掉（反向同步由 overview
  // 的对账逻辑处理）。
  const prefs = api.readPrefs()
  await api.writePrefs({ ...prefs, projects: prefs.projects.filter((p) => p !== rootDir) })
  const ws = api.ctx.workspaceRegistry.list().find((w) => w.path === rootDir)
  if (ws !== undefined) await api.ctx.workspaceRegistry.delete(ws.id)
  writeOk(res, { removed: rootDir, workspaceDeleted: ws !== undefined })
}

/** POST /overview —— 权威数据源 = 工作区注册表，附带提案进度与绑定标记。 */
export async function handleOverview(api: ApiRouteContext, res: unknown): Promise<void> {
  const { ctx } = api
  // 权威数据源 = 工作区注册表，让 OpenSpec 项目和侧边栏
  // 工作区保持一致：任一侧增删的工作区都会在这里反映。
  const workspaces = ctx.workspaceRegistry.list()
  const all = await Promise.all(workspaces.map(async (ws) => ({
    ws,
    changes: await readProjectChanges(ws.path),
    isOpenspec: await isOpenspecProject(ws.path),
  })))
  // 把偏好对账成注册表路径的忠实缓存，这样从侧边栏一侧
  // 删除的工作区在这里也会消失。
  const registryPaths = new Set(workspaces.map((ws) => ws.path))
  const prefs = api.readPrefs()
  const reconciled = prefs.projects.filter((p) => registryPaths.has(p))
  for (const entry of all) {
    if (entry.isOpenspec && !reconciled.includes(entry.ws.path)) reconciled.push(entry.ws.path)
  }
  if (reconciled.length !== prefs.projects.length || reconciled.some((p, i) => p !== prefs.projects[i])) {
    await api.writePrefs({ ...prefs, projects: reconciled })
  }
  const openspecProjects = all
    .filter((entry) => entry.isOpenspec)
    .map((entry) => ({
      path: entry.ws.path,
      name: entry.ws.title || basename(entry.ws.path) || entry.ws.path,
      workspaceId: entry.ws.id,
      sessionIds: [...entry.ws.sessionIds],
      stillValid: entry.isOpenspec,
      changes: entry.changes,
    }))
  // 待绑定对账（birthtime 配对，见 ChangeSessionBindings.reconcile）。
  // 之后再读一次标记，让刚落盘的绑定立即出现在响应里。
  await api.bindings.reconcile(openspecProjects)
  const markers = await Promise.all(openspecProjects.map(async (project) => {
    const map: Record<string, string> = {}
    for (const change of project.changes) {
      const marker = await api.bindings.readMarker(join(project.path, 'openspec', 'changes', change.name))
      if (marker !== undefined) map[change.name] = marker
    }
    return map
  }))
  let index = 0
  for (const project of openspecProjects) {
    ;(project as { changeSessions: Record<string, string> }).changeSessions = markers[index]!
    index += 1
  }
  writeOk(res, { projects: openspecProjects })
}

/** POST /file.read —— 读取一个产物文件的内容用于预览（带安全栅栏）。 */
export async function handleFileRead(api: ApiRouteContext, res: unknown, body: Record<string, unknown>): Promise<void> {
  const filePath = requireString(body, 'path')
  if (!isPreviewablePath(filePath)) {
    writeError(res, 'forbidden', 'file type not previewable', 403)
    return
  }
  const check = await checkPreviewableFile(api.ctx, filePath)
  if (check.error !== undefined) { writeError(res, check.error.code, check.error.message, check.error.status); return }
  const content = await fsp.readFile(filePath, 'utf8')
  writeOk(res, { path: filePath, bytes: check.stat!.bytes, mtime: check.stat!.mtime, content })
}

/** POST /raw.url —— 把产物绝对路径解析成 /openspec/api/raw/ 的预览 URL。 */
export async function handleRawUrl(api: ApiRouteContext, res: unknown, body: Record<string, unknown>): Promise<void> {
  const filePath = requireString(body, 'path')
  const ws = api.ctx.workspaceRegistry.list().find((w) => filePath.startsWith(join(w.path, 'openspec') + '/'))
  if (ws === undefined) {
    writeError(res, 'forbidden', 'path is outside any registered workspace openspec/ directory', 403)
    return
  }
  if (!isPreviewablePath(filePath)) {
    writeError(res, 'forbidden', 'file type not previewable', 403)
    return
  }
  const check = await checkPreviewableFile(api.ctx, filePath)
  if (check.error !== undefined) { writeError(res, check.error.code, check.error.message, check.error.status); return }
  const relPath = filePath.slice(join(ws.path, 'openspec').length + 1)
  const wsId = Buffer.from(ws.path, 'utf8').toString('base64')
  writeOk(res, { url: `/openspec/api/raw/${encodeURIComponent(wsId)}/${relPath.split('/').map(encodeURIComponent).join('/')}` })
}

/** POST /changeSession.bind —— 记录待绑定（提案目录出现后由对账落盘）。 */
export async function handleChangeSessionBind(api: ApiRouteContext, res: unknown, body: Record<string, unknown>): Promise<void> {
  const projectPath = requireString(body, 'projectPath')
  const sessionId = requireString(body, 'sessionId')
  api.bindings.bindLater(projectPath, sessionId)
  writeOk(res, { projectPath, sessionId })
}

/** POST /changeSession.get —— 查询提案绑定的会话 id（先对账再读标记）。 */
export async function handleChangeSessionGet(api: ApiRouteContext, res: unknown, body: Record<string, unknown>): Promise<void> {
  const projectPath = requireString(body, 'projectPath')
  const changeName = requireString(body, 'changeName')
  const changes = await readProjectChanges(projectPath).catch(() => [])
  await api.bindings.reconcile([{ path: projectPath, changes }])
  const marker = await api.bindings.readMarker(join(projectPath, 'openspec', 'changes', changeName))
  writeOk(res, { sessionId: marker ?? null })
}
