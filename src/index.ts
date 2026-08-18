/**
 * dsh-openspec-suite host half.
 *
 * OpenSpec management API under `/openspec/api/*` (same trust fence shape
 * as the better-sidebar routes): folder scanning, workspace import,
 * per-project proposal progress.
 */

import { basename, join } from 'node:path'
import { promises as fsp } from 'node:fs'
import type { Context } from './context-types.ts'

/** Plugin identity for cordis.yml rows. */
export const name = 'dsh-openspec-suite'

/** Services required before mounting. */
export const inject = ['webServer', 'sessions', 'workspaceRegistry']

/** Trust fence: loopback browser origins only, mirroring the sidebar's fence. */
function isTrustedApiRequest(hostHeader: string | undefined): boolean {
  if (hostHeader === undefined) return false
  const hostname = hostHeader.split(':')[0]!.toLowerCase()
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]'
}

// ── OpenSpec discovery ─────────────────────────────────────────────────────

/** One detected OpenSpec project. */
export interface OpenSpecProject {
  /** Project root (absolute path). */
  path: string
  /** Directory basename. */
  name: string
  /** Whether the root itself is the openspec project (vs nested deeper). */
  root: boolean
}

const MAX_SCAN_DEPTH = 4
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.venv', 'venv', '__pycache__', 'target', 'openspec'])

/** Whether `dir` contains an `openspec/` directory with a `changes/` child. */
async function isOpenspecProject(dir: string): Promise<boolean> {
  try {
    const stat = await fsp.stat(join(dir, 'openspec', 'changes'))
    return stat.isDirectory()
  } catch {
    return false
  }
}

/**
 * Enumerate candidate directories under `rootDir` up to `maxDepth` levels.
 * Uses recursive readdir (returns names only) and re-checks each candidate
 * with stat(), so Dirent type fields (which have proven unreliable inside the
 * Electron host for `entry.isDirectory()`) are never trusted.
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
 * Scan `rootDir` (itself included) up to `maxDepth` levels for directories
 * containing `openspec/changes/`.
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

// ── Proposal progress ──────────────────────────────────────────────────────

/** One change proposal with its artifact/task progress. */
export interface OpenSpecChange {
  name: string
  /** Artifacts present: proposal / design / specs / tasks. */
  artifacts: { proposal: boolean; design: boolean; specs: boolean; tasks: boolean }
  /** Checked / total checkboxes in tasks.md (0/0 when absent). */
  tasks: { done: number; total: number }
}

/** Parse tasks.md checkbox progress. */
function parseTasks(content: string): { done: number; total: number } {
  let done = 0
  let total = 0
  for (const match of content.matchAll(/^\s*[-*]\s+\[( |x|X)\]/gm)) {
    total += 1
    if (match[1] !== ' ') done += 1
  }
  return { done, total }
}

/** Read one change directory into a progress summary. */
async function readChange(changeDir: string, changeName: string, signal?: AbortSignal): Promise<OpenSpecChange | null> {
  const artifacts = { proposal: false, design: false, specs: false, tasks: false }
  let tasksProgress = { done: 0, total: 0 }
  try {
    const entries = await fsp.readdir(changeDir, { withFileTypes: true })
    for (const entry of entries) {
      if (signal?.aborted) return null
      if (entry.name === 'proposal.md') artifacts.proposal = true
      else if (entry.name === 'design.md') artifacts.design = true
      else if (entry.name === 'tasks.md') {
        artifacts.tasks = true
        try {
          tasksProgress = parseTasks(await fsp.readFile(join(changeDir, 'tasks.md'), 'utf8'))
        } catch { /* unreadable tasks.md still counts as present */ }
      } else if (entry.name === 'specs' && entry.isDirectory()) {
        const specFiles = await fsp.readdir(join(changeDir, 'specs'), { withFileTypes: true })
        artifacts.specs = specFiles.some((candidate) => candidate.isFile() && candidate.name.endsWith('.md'))
      }
    }
  } catch {
    return null
  }
  return { name: changeName, artifacts, tasks: tasksProgress }
}

/** Summarize every active (non-archived) change of one openspec project. */
export async function readProjectChanges(projectDir: string, signal?: AbortSignal): Promise<OpenSpecChange[]> {
  const changesDir = join(projectDir, 'openspec', 'changes')
  let entries
  try {
    entries = await fsp.readdir(changesDir, { withFileTypes: true })
  } catch {
    return []
  }
  const changes: OpenSpecChange[] = []
  for (const entry of entries) {
    if (signal?.aborted) break
    if (!entry.isDirectory() || entry.name === 'archive') continue
    const change = await readChange(join(changesDir, entry.name), entry.name, signal)
    if (change !== null) changes.push(change)
  }
  return changes
}

// ── Settings ───────────────────────────────────────────────────────────────

import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import z from 'schemastery'

const PREFS_NS = settingsNamespace('dsh-openspec-suite')

const PrefsSchema = z.object({
  /** Imported project roots (absolute paths), in import order. */
  projects: z.array(z.string()).default([]),
  /** Last scan root, pre-filled in the import view. */
  lastScanRoot: z.string().default(''),
})

interface Prefs {
  projects: string[]
  lastScanRoot: string
}

// ── Wire helpers ───────────────────────────────────────────────────────────

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

/** Parse the JSON body of one request, size-capped. */
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

// ── Plugin ─────────────────────────────────────────────────────────────────

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
        const method = url.pathname.replace(/^\/openspec\/api\//u, '')
        try {
          if (method === 'prefs.get') {
            writeOk(res, readPrefs())
            return
          }
          const body = await readJsonBody(req)
          switch (method) {
            case 'dir.list': {
              // browse-capability directory listing for the import picker
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
              // one-shot OS folder chooser through the host directoryPicker
              // seam; browse-only hosts answer 501 and the client falls back
              // to its in-app directory browser.
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
              // IncomingMessage exposes no abort signal for a fully-read body,
              // so the chooser runs on its own lifetime; a client navigating
              // away simply ignores the answered pick.
              const path = await capability.pick(new AbortController().signal)
              writeOk(res, { path: path ?? null })
              return
            }
            case 'diag': {
              // temporary diagnostics: why does a parent scan find nothing?
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
                // probe one named child (or the first scannable dir) exactly as the scan would
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
              // re-run the exact scan path and trace what it does
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
              // scan the picked root (recursively) and import EVERY openspec
              // project found beneath it — the picked folder itself does not
              // need to be a project.
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
              // attach diagnostics when nothing is found, so "why is my
              // project not detected" is answerable from the wire
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
              // Remove from BOTH the prefs index and the workspace registry, so
              // deleting a project here also drops it from the sidebar (and
              // vice versa is handled by overview's reconciliation).
              const prefs = readPrefs()
              await updatePrefs({ ...prefs, projects: prefs.projects.filter((p) => p !== rootDir) })
              const ws = ctx.workspaceRegistry.list().find((w) => w.path === rootDir)
              if (ws !== undefined) await ctx.workspaceRegistry.delete(ws.id)
              writeOk(res, { removed: rootDir, workspaceDeleted: ws !== undefined })
              return
            }
            case 'overview': {
              // Authoritative source = the workspace registry, so OpenSpec
              // projects and the sidebar workspaces stay in lockstep: a
              // workspace added/removed from either side is reflected here.
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
              // Reconcile prefs to a faithful cache of registry paths, so a
              // workspace deleted from the sidebar side disappears here too.
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
