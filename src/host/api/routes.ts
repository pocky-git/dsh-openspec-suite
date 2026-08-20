/**
 * `/openspec/api/*` 路由：信任栅栏、raw 文件子路由与 JSON 方法分发。
 */

import { join } from 'node:path'
import { promises as fsp } from 'node:fs'
import type { Context } from '../../context-types.ts'
import { ChangeSessionBindings } from '../openspec/change-session-bindings.ts'
import { createPrefsScope, updatePrefs as writePrefsToSettings, type Prefs } from '../prefs.ts'
import {
  handleDirList,
  handleFileRead,
  handleImport,
  handleOverview,
  handlePick,
  handleRawUrl,
  handleRemove,
  handleScan,
  handleScanAndImportAll,
  handleChangeSessionBind,
  handleChangeSessionGet,
  type ApiRouteContext,
} from './handlers.ts'
import { checkPreviewableFile, contentTypeFor, isPreviewablePath, isTrustedApiRequest, readJsonBody, writeError, writeOk } from './wire.ts'

/**
 * GET /openspec/api/raw/<wsId>/<openspec 内相对路径> —— 原始文件
 * 路由，供 iframe 预览 design.html 等交互产物。把路径编进 URL
 * path（而非 query），iframe 内的相对引用（../../mermaid.min.js）
 * 会被浏览器相对此 URL 正确解析到同一路由下的真实文件位置。
 */
async function serveRawFile(ctx: Context, res: unknown, pathname: string): Promise<void> {
  const rest = pathname.slice('/openspec/api/raw/'.length)
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
}

/** 在 ctx 上注册 /openspec/api 前缀路由（供 apply 调用）。 */
export function registerApiRoutes(ctx: Context, scanDepth: number): void {
  ctx.inject(['settings'], (sctx) => {
    // settings.register 只能调用一次（重复注册会报 already registered），
    // 在子作用域创建时注册一次并持有句柄，后续全部走它读取。
    const prefsScope = createPrefsScope(sctx.settings)
    const bindings = new ChangeSessionBindings()
    const api: ApiRouteContext = {
      ctx,
      readPrefs: () => prefsScope.get(),
      writePrefs: (patch) => writePrefsToSettings(sctx.settings, patch),
      bindings,
      scanDepth,
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
        if (req.method === 'GET' && url.pathname.startsWith('/openspec/api/raw/')) {
          await serveRawFile(ctx, res, url.pathname)
          return
        }
        const method = url.pathname.replace(/^\/openspec\/api\//u, '')
        try {
          if (method === 'prefs.get') {
            writeOk(res, api.readPrefs())
            return
          }
          const body = await readJsonBody(req)
          switch (method) {
            case 'dir.list': return await handleDirList(api, res, body)
            case 'pick': return await handlePick(api, res)
            case 'scanAndImportAll': return await handleScanAndImportAll(api, res, body)
            case 'scan': return await handleScan(api, res, body)
            case 'import': return await handleImport(api, res, body)
            case 'remove': return await handleRemove(api, res, body)
            case 'overview': return await handleOverview(api, res)
            case 'file.read': return await handleFileRead(api, res, body)
            case 'raw.url': return await handleRawUrl(api, res, body)
            case 'changeSession.bind': return await handleChangeSessionBind(api, res, body)
            case 'changeSession.get': return await handleChangeSessionGet(api, res, body)
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
