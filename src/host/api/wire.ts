/**
 * `/openspec/api/*` 的 HTTP 传输层辅助：信任栅栏、JSON 信封读写、
 * 预览文件类型判定与安全检查。
 */

import { join } from 'node:path'
import { promises as fsp } from 'node:fs'
import type { Context } from '../../context-types.ts'

/** 信任栅栏：只允许 loopback 浏览器来源。 */
export function isTrustedApiRequest(hostHeader: string | undefined): boolean {
  if (hostHeader === undefined) return false
  const hostname = hostHeader.split(':')[0]!.toLowerCase()
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]'
}

/** 可预览的文件扩展名（产物常见类型；.html 通过 iframe 原始路由预览）。 */
const PREVIEWABLE_EXTENSIONS = new Set(['.md', '.html', '.htm', '.yaml', '.yml', '.json', '.txt', '.js', '.css'])

/** 判断路径是否为可预览类型。 */
export function isPreviewablePath(filePath: string): boolean {
  const dot = filePath.lastIndexOf('.')
  if (dot === -1) return false
  return PREVIEWABLE_EXTENSIONS.has(filePath.slice(dot).toLowerCase())
}

/** 原始路由的 content-type。 */
export function contentTypeFor(filePath: string): string {
  const dot = filePath.lastIndexOf('.')
  const ext = dot === -1 ? '' : filePath.slice(dot).toLowerCase()
  if (ext === '.html' || ext === '.htm') return 'text/html; charset=utf-8'
  if (ext === '.json') return 'application/json; charset=utf-8'
  if (ext === '.yaml' || ext === '.yml') return 'text/yaml; charset=utf-8'
  return 'text/plain; charset=utf-8'
}

interface FileCheckError {
  code: string
  message: string
  status: number
}

/**
 * 校验一个文件是否在某个已注册工作区的 openspec/ 目录内、存在、
 * 且小于大小上限。返回 stat 或 error（直接可用于 writeError）。
 */
export async function checkPreviewableFile(
  ctx: Context,
  filePath: string,
): Promise<{ stat?: { bytes: number; mtime: string }; error?: FileCheckError }> {
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

// ── JSON 信封读写 ───────────────────────────────────────────────────────────

interface WireResponse {
  setHeader(k: string, v: string): void
  statusCode: number
  end(body: string): void
}

function writeJson(res: unknown, status: number, body: unknown): void {
  const r = res as WireResponse
  r.setHeader('content-type', 'application/json')
  r.statusCode = status
  r.end(JSON.stringify(body))
}

export function writeOk(res: unknown, value: unknown): void {
  writeJson(res, 200, { ok: true, value })
}

export function writeError(res: unknown, code: string, message: string, status = 400): void {
  writeJson(res, status, { ok: false, error: { code, message } })
}

interface WireRequest {
  method?: string
  body?: unknown
}

/** 解析单个请求的 JSON body，带大小上限。 */
export async function readJsonBody(req: WireRequest): Promise<Record<string, unknown>> {
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

/** 从 body 中取出必填的字符串字段，缺失/为空时抛错。 */
export function requireString(body: Record<string, unknown>, key: string): string {
  const value = body[key]
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${key} must be a non-empty string`)
  return value
}
