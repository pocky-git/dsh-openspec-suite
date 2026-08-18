/**
 * dsh-openspec-suite client half.
 *
 * 1. An icon button (same visual style as the sidebar's "add workspace"
 *    button, inline IconListPenOutline16 SVG) is injected into the left
 *    sidebar workspace section header, immediately to the right of the
 *    add-workspace (+) button. Clicking it opens the OpenSpec overview
 *    page (see 2) and starts the import flow: a folder picker — the
 *    host's OS-native chooser when available, otherwise the in-app
 *    browse dialog — then automatic scan+import of EVERY openspec/
 *    project found in the chosen subtree.
 * 2. The overview itself is a SECOND-LEVEL PAGE inside the left sidebar:
 *    an overlay covering the workspace browser area (section header +
 *    session list) with its own header ("← 返回" + title) and the
 *    per-project proposal progress list.
 *
 * Talks to the host half through the same-origin `/openspec/api/*` JSON
 * envelope ({ok, value} / {ok:false, error}) the better-sidebar uses.
 */

/** Plugin identity. */
export const name = 'dsh-openspec-suite/client'

import * as React from 'react'
import * as ReactDOMClient from 'react-dom/client'
import type { Context } from './client-context.ts'

interface OpenSpecChangeWire {
  name: string
  artifacts: { proposal: boolean; design: boolean; specs: boolean; tasks: boolean }
  tasks: { done: number; total: number }
}

interface ProjectWire {
  path: string
  name: string
  stillValid: boolean
  changes: OpenSpecChangeWire[]
}

interface ScanProjectWire {
  path: string
  name: string
  root: boolean
}

interface ImportAllResult {
  root: string
  count: number
  imported: string[]
  existing: string[]
  failed: Array<{ path: string; message: string }>
  projects: ScanProjectWire[]
}

async function call<T>(method: string, payload: Record<string, unknown> = {}, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/openspec/api/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  })
  const parsed = await response.json().catch(() => null)
  if (!response.ok || parsed === null || parsed.ok !== true || parsed.value === undefined) {
    const error = new Error(parsed?.error?.message ?? `HTTP ${response.status}`) as Error & { code?: string }
    if (parsed?.error?.code !== undefined) error.code = String(parsed.error.code)
    throw error
  }
  return parsed.value as T
}

const e = React.createElement

// ── icons (geometry lifted from @deepseek-ai/dsh-client-ui-primitives so the
// button reads as native UI; currentColor follows the theme) ───────────────

const ICON_LIST_PEN_PATHS = [
  'M10.8239 3.54733V4.78443H4.63437V3.54733H10.8239Z',
  'M10.8239 6.12629V7.36338H4.63437V6.12629H10.8239Z',
  'M9.073 8.70524V9.94234H4.63437V8.70524H9.073Z',
  'M9.13321 0.573526C10.0076 0.573525 10.7179 0.572522 11.285 0.63397C11.8645 0.696791 12.3743 0.831648 12.8193 1.1548C13.0776 1.34246 13.3056 1.57047 13.4933 1.82875C13.8164 2.2737 13.9513 2.7836 14.0141 3.36303C14.0755 3.93015 14.0745 4.64049 14.0745 5.51485V6.1757L12.7327 7.5629V5.51485C12.7327 4.61092 12.732 3.9862 12.6803 3.5081C12.6298 3.0427 12.5379 2.79497 12.4083 2.61654C12.3033 2.47211 12.176 2.34472 12.0315 2.23977C11.8531 2.11016 11.6054 2.01823 11.14 1.96777C10.6618 1.91601 10.0372 1.91539 9.13321 1.91539H6.32658C5.42262 1.91539 4.79796 1.91604 4.31983 1.96777C3.85451 2.01819 3.60672 2.11029 3.42827 2.23977C3.28392 2.34465 3.15643 2.47223 3.0515 2.61654C2.9219 2.79496 2.82997 3.04274 2.7795 3.5081C2.72774 3.9862 2.72712 4.61092 2.72712 5.51485V10.023C2.72712 10.9273 2.72773 11.5525 2.7795 12.0307C2.82992 12.4959 2.92205 12.7429 3.0515 12.9213C3.15645 13.0657 3.28384 13.1931 3.42827 13.2981C3.60676 13.4277 3.85408 13.5206 4.31983 13.5711C4.79797 13.6228 5.42259 13.6234 6.32658 13.6234H6.87057L5.57707 14.9593C5.03527 14.9556 4.57031 14.9467 4.17476 14.9039C3.59508 14.841 3.08558 14.7063 2.64048 14.383C2.38215 14.1953 2.15422 13.9684 1.96653 13.7101C1.64319 13.2649 1.50851 12.7546 1.4457 12.1748C1.38432 11.6076 1.38525 10.8974 1.38525 10.023V5.51485C1.38525 4.64049 1.38426 3.93015 1.4457 3.36303C1.50853 2.78363 1.64341 2.27368 1.96653 1.82875C2.15417 1.57059 2.38228 1.34239 2.64048 1.1548C3.08544 0.831805 3.59533 0.696762 4.17476 0.63397C4.74193 0.572552 5.45218 0.573525 6.32658 0.573526H9.13321 0.573526Z',
  'M14.2193 14.9553H10.0124L11.3744 13.6134H14.2193V14.9553Z',
  'M8.24493 13.3711L7.49015 14.8806C7.40148 15.058 7.58961 15.2461 7.76695 15.1574L9.27651 14.4027L14.6147 9.09934L13.5832 8.06775L8.24493 13.3711Z',
]

function IconListPenOutline16(props: { size?: number }): React.ReactElement {
  const size = props.size ?? 16
  return e('svg', {
    width: size, height: size, viewBox: '0 0 16 16', fill: 'none', xmlns: 'http://www.w3.org/2000/svg',
    style: { display: 'block', flex: 'none' },
  }, ICON_LIST_PEN_PATHS.map((d, index) => e('path', { key: index, d, fill: 'currentColor' })))
}

function IconChevronLeftOutline14(props: { size?: number }): React.ReactElement {
  const size = props.size ?? 14
  return e('svg', {
    width: size, height: size, viewBox: '0 0 14 14', fill: 'none', xmlns: 'http://www.w3.org/2000/svg',
    style: { display: 'block', flex: 'none' },
  },
    e('path', { d: 'M8.87467 3.40786C9.08815 3.62133 9.08815 3.96753 8.87467 4.18101L6.05568 7L8.87467 9.81899C9.08815 10.0325 9.08815 10.3787 8.87467 10.5921C8.6612 10.8056 8.315 10.8056 8.10152 10.5921L4.87533 7.36594C4.66186 7.15247 4.66186 6.80626 4.87533 6.59279L8.10152 3.3666C8.315 3.15312 8.6612 3.15312 8.87467 3.3666Z', fill: 'currentColor' }),
  )
}

// ── shared module state (the header button and the page both drive it) ──────

interface SuiteState {
  /** Result of the last pick-and-import run, shown in the overview page. */
  lastImport: ImportAllResult | null
  /** Bump to make the overview page reload its project list. */
  reloadToken: number
  /** Open the fallback browse dialog (set by the entry button, consumed by the page). */
  browseRequest: number
  /** Whether the second-level page is shown. */
  pageOpen: boolean
}

let suiteState: SuiteState = { lastImport: null, reloadToken: 0, browseRequest: 0, pageOpen: false }
const suiteListeners = new Set<() => void>()

function setSuiteState(patch: Partial<SuiteState>): void {
  suiteState = { ...suiteState, ...patch }
  for (const listener of suiteListeners) listener()
}

function useSuiteState(): SuiteState {
  const [state, setState] = React.useState(suiteState)
  React.useEffect(() => {
    const listener = () => setState(suiteState)
    suiteListeners.add(listener)
    return () => { suiteListeners.delete(listener) }
  }, [])
  return state
}

// ── overview page (rendered into the sidebar overlay) ──────────────────────

function styles(): Record<string, React.CSSProperties> {
  return {
    page: {
      position: 'absolute', inset: 0, zIndex: 20,
      display: 'flex', flexDirection: 'column',
      background: 'var(--dsw-specific-sidebar-fill, var(--dsw-alias-bg-canvas, #fff))',
      borderRadius: 12, overflow: 'hidden',
    },
    pageHeader: {
      display: 'flex', alignItems: 'center', gap: 6, flex: 'none',
      height: 36, padding: '0 4px', marginBottom: 4, boxSizing: 'border-box',
      color: 'var(--dsw-alias-label-secondary)',
    },
    backBtn: {
      cursor: 'pointer', width: 28, height: 28, flex: 'none',
      display: 'inline-flex', justifyContent: 'center', alignItems: 'center',
      color: 'var(--dsw-alias-label-secondary)', background: 'transparent',
      border: 'none', borderRadius: '50%', padding: 0, outline: 'none',
    },
    pageBody: { flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, padding: '6px 16px 16px', boxSizing: 'border-box', fontSize: 13 },
    h: { fontSize: 13, fontWeight: 600, margin: 0 },
    muted: { opacity: 0.6, fontSize: 12 },
    row: { display: 'flex', gap: 8, alignItems: 'center' },
    btn: { padding: '5px 10px', borderRadius: 6, border: '1px solid rgba(128,128,128,.35)', background: 'transparent', color: 'inherit', cursor: 'pointer', fontSize: 12, whiteSpace: 'nowrap' },
    btnPrimary: { padding: '5px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, whiteSpace: 'nowrap', color: '#fff', background: 'var(--dsw-alias-state-business-primary, #4d6bfe)' },
    card: { border: '1px solid rgba(128,128,128,.25)', borderRadius: 8, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 },
    entry: { display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 12.5 },
    dot: { width: 8, height: 8, borderRadius: '50%', flexShrink: 0 },
    bar: { height: 4, borderRadius: 2, background: 'rgba(128,128,128,.25)', overflow: 'hidden', flex: 1 },
    fill: { height: '100%', borderRadius: 2, background: 'var(--dsw-alias-state-business-primary, #4d6bfe)' },
    err: { color: 'var(--dsw-alias-state-error-primary, #e5484d)', fontSize: 12, whiteSpace: 'pre-wrap' },
    scanRow: { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', border: '1px solid rgba(128,128,128,.25)', borderRadius: 6, fontSize: 12.5 },
    input: { flex: 1, minWidth: 0, padding: '5px 8px', borderRadius: 6, border: '1px solid rgba(128,128,128,.35)', background: 'transparent', color: 'inherit', fontSize: 12 },
  }
}

interface PickerState {
  open: boolean
  path: string
  entries: Array<{ name: string; path: string }>
  error: string
}

function OverviewPage(props: { onBack: () => void }): React.ReactElement {
  const s = styles()
  const suite = useSuiteState()
  const [projects, setProjects] = React.useState<ProjectWire[] | null>(null)
  const [error, setError] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [picker, setPicker] = React.useState<PickerState>({ open: false, path: '', entries: [], error: '' })

  const reload = React.useCallback((signal?: AbortSignal) => {
    call<{ projects: ProjectWire[] }>('overview', {}, signal)
      .then((value) => { setProjects(value.projects); setError('') })
      .catch((err) => { if (err.name !== 'AbortError') setError(String(err.message ?? err)) })
  }, [])

  React.useEffect(() => {
    const controller = new AbortController()
    reload(controller.signal)
    return () => controller.abort()
  }, [suite.reloadToken, reload])

  // The entry button requests the fallback browse dialog when the host has
  // no OS chooser: honor NEW requests only.
  const seenBrowseRequest = React.useRef(suite.browseRequest)
  React.useEffect(() => {
    if (suite.browseRequest === seenBrowseRequest.current) return
    seenBrowseRequest.current = suite.browseRequest
    setPicker({ open: true, path: '', entries: [], error: '' })
    call<{ path: string; entries: Array<{ name: string; path: string }> }>('dir.list', {})
      .then((listing) => setPicker({ open: true, path: listing.path, entries: listing.entries, error: '' }))
      .catch((err) => setPicker({ open: false, path: '', entries: [], error: `目录浏览不可用（${String((err as Error).message ?? err)}）` }))
  }, [suite.browseRequest])

  const importAllUnder = async (dir: string): Promise<void> => {
    setBusy(true); setError('')
    try {
      const result = await call<ImportAllResult>('scanAndImportAll', { path: dir })
      setSuiteState({ lastImport: result, reloadToken: suiteState.reloadToken + 1 })
      setPicker((p) => ({ ...p, open: false }))
      if (result.count === 0) setError('所选文件夹内没有发现 OpenSpec 项目（需包含 openspec/changes 目录）')
    } catch (err) { setError(String((err as Error).message ?? err)) }
    finally { setBusy(false) }
  }

  const startImport = async (): Promise<void> => {
    try {
      const picked = await call<{ path: string | null }>('pick', {})
      if (picked.path !== null && picked.path !== '') await importAllUnder(picked.path)
    } catch (err) {
      const code = (err as { code?: string }).code
      if (code === 'picker-unavailable' || code === 'pick-unsupported') {
        setPicker({ open: true, path: '', entries: [], error: '' })
        try {
          const listing = await call<{ path: string; entries: Array<{ name: string; path: string }> }>('dir.list', {})
          setPicker({ open: true, path: listing.path, entries: listing.entries, error: '' })
        } catch { setPicker({ open: false, path: '', entries: [], error: '目录选择不可用' }) }
        return
      }
      setError(String((err as Error).message ?? err))
    }
  }

  const doRemove = async (dir: string): Promise<void> => {
    setBusy(true); setError('')
    try { await call('remove', { path: dir }); reload() }
    catch (err) { setError(String((err as Error).message ?? err)) }
    finally { setBusy(false) }
  }

  const browseTo = async (dir: string): Promise<void> => {
    try {
      const listing = await call<{ path: string; entries: Array<{ name: string; path: string }> }>('dir.list', { path: dir })
      setPicker({ open: true, path: listing.path, entries: listing.entries, error: '' })
    } catch (err) { setPicker((p) => ({ ...p, error: String((err as Error).message ?? err) })) }
  }

  return e('div', { style: s.page },
    e('div', { style: s.pageHeader },
      e('button', {
        style: s.backBtn, type: 'button', title: '返回工作区', 'aria-label': '返回工作区',
        onClick: props.onBack,
        onMouseEnter: (ev: React.MouseEvent<HTMLButtonElement>) => { ev.currentTarget.style.background = 'var(--dsw-alias-interactive-bg-hover)' },
        onMouseLeave: (ev: React.MouseEvent<HTMLButtonElement>) => { ev.currentTarget.style.background = 'transparent' },
      }, e(IconChevronLeftOutline14, { size: 14 })),
      e('span', { style: { ...s.h, color: 'var(--dsw-alias-label-primary)' } }, 'OpenSpec 项目总览'),
      e('div', { style: { flex: 1 } }),
      e('button', {
        style: { ...s.backBtn, width: 28, height: 28 }, type: 'button', title: '选择文件夹导入', 'aria-label': '选择文件夹导入',
        disabled: busy, onClick: () => void startImport(),
        onMouseEnter: (ev: React.MouseEvent<HTMLButtonElement>) => { ev.currentTarget.style.background = 'var(--dsw-alias-interactive-bg-hover)' },
        onMouseLeave: (ev: React.MouseEvent<HTMLButtonElement>) => { ev.currentTarget.style.background = 'transparent' },
      }, e('span', { style: { fontSize: 14, lineHeight: '14px' } }, '＋')),
    ),
    e('div', { style: s.pageBody },
      e('div', { style: s.row },
        e('button', { style: s.btnPrimary, disabled: busy, onClick: () => void startImport() }, busy ? '处理中…' : '📂 选择文件夹导入'),
        e('span', { style: s.muted }, '自动导入所选目录下所有 OpenSpec 项目'),
      ),
      picker.error !== '' && e('div', { style: s.err }, picker.error),
      picker.open && e('div', { style: { ...s.card, maxHeight: 260, overflow: 'auto' } },
        e('div', { style: s.row },
          e('button', { style: s.btn, onClick: () => void browseTo(parentOf(picker.path)) }, '↑ 上级'),
          e('span', { style: s.muted }, picker.path || '~'),
        ),
        picker.entries.length === 0 && e('div', { style: s.muted }, '（无子目录）'),
        picker.entries
          .filter((entry) => !entry.name.startsWith('.'))
          .map((entry) => e('div', {
            key: entry.path,
            style: { ...s.scanRow, cursor: 'pointer', border: 'none', padding: '3px 6px' },
            onClick: () => void browseTo(entry.path),
            onMouseEnter: (ev: React.MouseEvent<HTMLDivElement>) => { ev.currentTarget.style.background = 'rgba(128,128,128,.15)' },
            onMouseLeave: (ev: React.MouseEvent<HTMLDivElement>) => { ev.currentTarget.style.background = 'transparent' },
          }, '📁 ', entry.name)),
        e('div', { style: { ...s.row, marginTop: 6 } },
          e('button', { style: s.btnPrimary, disabled: busy, onClick: () => void importAllUnder(picker.path) }, busy ? '导入中…' : '导入此目录下所有项目'),
          e('button', { style: s.btn, onClick: () => setPicker((p) => ({ ...p, open: false })) }, '取消'),
        ),
      ),
      suite.lastImport !== null && e('div', { style: { ...s.card, gap: 8 } },
        e('div', { style: s.h }, `在 ${suite.lastImport.root} 发现 ${suite.lastImport.count} 个 OpenSpec 项目`),
        e('div', { style: s.muted },
          `新导入 ${suite.lastImport.imported.length} · 已存在 ${suite.lastImport.existing.length}` +
          (suite.lastImport.failed.length > 0 ? ` · 失败 ${suite.lastImport.failed.length}` : '')),
        suite.lastImport.projects.map((project) => e('div', { key: project.path, style: s.scanRow },
          e('span', { style: { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' } },
            `📦 ${project.name}`,
            suite.lastImport!.failed.some((f) => f.path === project.path) ? '（导入失败）'
              : suite.lastImport!.existing.includes(project.path) ? '（已在工作区）'
                : suite.lastImport!.imported.includes(project.path) ? ' ✓' : ''),
        )),
        suite.lastImport.failed.length > 0 && e('div', { style: s.err },
          suite.lastImport.failed.map((f) => `${f.path}: ${f.message}`).join('\n')),
      ),
      error !== '' && e('div', { style: s.err }, error),
      projects === null
        ? e('div', { style: s.muted }, '加载中…')
        : e('div', { style: { display: 'flex', flexDirection: 'column', gap: 10 } },
          e('div', { style: s.h }, `已导入项目（${projects.length}）`),
          projects.length === 0 && e('div', { style: s.muted }, '还没有导入项目。点击上方按钮选择文件夹，自动发现并导入其中的 OpenSpec 项目。'),
          projects.map((project) => {
            const totalTasks = project.changes.reduce((sum, change) => sum + change.tasks.total, 0)
            const doneTasks = project.changes.reduce((sum, change) => sum + change.tasks.done, 0)
            const pct = totalTasks === 0 ? 0 : Math.round((doneTasks / totalTasks) * 100)
            return e('div', {
              key: project.path,
              style: s.card,
            },
              e('div', { style: { ...s.row, justifyContent: 'space-between' } },
                e('span', { style: s.h }, project.name),
                e('button', { style: { ...s.btn, padding: '2px 8px', fontSize: 11 }, onClick: () => void doRemove(project.path), title: '从工作区和列表同时移除' }, '移除'),
              ),
              e('div', { style: { ...s.muted, overflow: 'hidden', textOverflow: 'ellipsis' } }, project.path),
              !project.stillValid && e('div', { style: { ...s.muted, color: '#e5a13d' } }, '⚠ openspec/ 目录已不存在'),
              e('div', { style: s.row },
                e('div', { style: s.bar }, e('div', { style: { ...s.fill, width: `${pct}%` } })),
                e('span', { style: { ...s.muted, whiteSpace: 'nowrap' } }, `${doneTasks}/${totalTasks} 任务 · ${pct}%`),
              ),
              project.changes.length === 0
                ? e('div', { style: s.muted }, '无活跃提案')
                : project.changes.map((change) => {
                  const artifacts = (['proposal', 'design', 'specs', 'tasks'] as const)
                    .map((key) => change.artifacts[key] ? key : null).filter((v) => v !== null)
                  return e('div', { key: change.name, style: s.entry },
                    e('span', { style: { ...s.dot, background: change.tasks.total > 0 && change.tasks.done === change.tasks.total ? '#30a46c' : '#e5a13d' } }),
                    e('span', { style: { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' } }, change.name),
                    e('span', { style: { ...s.muted, whiteSpace: 'nowrap' } },
                      artifacts.join('·'), ' ', change.tasks.total > 0 ? `(${change.tasks.done}/${change.tasks.total})` : ''),
                  )
                }),
            )
          }),
        ),
    ),
  )
}

function parentOf(path: string): string {
  const normalized = path.replace(/\/+$/u, '')
  if (normalized === '' || normalized === '/') return '/'
  const cut = normalized.lastIndexOf('/')
  return cut <= 0 ? '/' : normalized.slice(0, cut)
}

// ── sidebar injection: entry button + second-level page overlay ────────────

const HEADER_BTN_ID = 'openspec-suite-overview-btn'
const PAGE_HOST_ID = 'openspec-suite-page-host'

/**
 * Find the workspace section header's add-workspace icon button (an svg
 * with the IconProjectAddOutline16 geometry inside a rounded 28px/36px
 * icon button). Returns null until the sidebar has rendered it.
 */
function findAddWorkspaceButton(): HTMLButtonElement | null {
  const buttons = document.querySelectorAll('button')
  for (const button of buttons) {
    if (button.closest(`#${PAGE_HOST_ID}`) !== null) continue
    const svg = button.querySelector('svg')
    if (svg === null) continue
    const path = svg.querySelectorAll('path')[1]
    const d = path?.getAttribute('d') ?? ''
    if (!d.startsWith('M4.76367 0C5.36861')) continue
    // must look like a round icon button (the workspace header style)
    const radius = window.getComputedStyle(button).borderRadius
    const round = radius === '50%' || radius.endsWith('px') && parseFloat(radius) >= 10
    if (!round) continue
    // must NOT be inside our own page overlay
    if (button.closest(`[data-openspec-suite-panel]`) !== null) continue
    return button as HTMLButtonElement
  }
  return null
}

/** True when the button is inside the sidebar's workspace list header (not e.g. a menu portal). */
function inWorkspaceHeader(button: HTMLButtonElement): boolean {
  const svgSize = button.querySelector('svg')?.getAttribute('width') ?? ''
  return svgSize === '16' || svgSize === '18'
}

interface SidebarInjection {
  destroy: () => void
}

/**
 * Inject the entry button into the workspace section header and manage the
 * second-level page overlay (a React tree rendered into the workspace
 * browser root, covering header + session list while open).
 */
function injectSidebar(): SidebarInjection {
  let buttonHost: HTMLDivElement | null = null
  let placedBeside: HTMLButtonElement | null = null
  let pageHost: HTMLDivElement | null = null
  let reactRoot: ReactDOMClient.Root | null = null
  let observer: MutationObserver | null = null
  let disposed = false

  /** Render (or tear down) the page overlay per suite state. */
  const syncPage = (): void => {
    if (disposed) return
    const open = suiteState.pageOpen
    // The page needs the sidebar DOM to anchor against; best-effort placement
    // happens in mount(), but the React tree itself can render as soon as the
    // host exists.
    if (open && pageHost === null) {
      pageHost = document.createElement('div')
      pageHost.id = PAGE_HOST_ID
      pageHost.setAttribute('data-openspec-suite-panel', '1')
      Object.assign(pageHost.style, { position: 'absolute', inset: '0', zIndex: '20' } satisfies Partial<CSSStyleDeclaration>)
      // attach to the workspace browser root when available; body fallback is
      // never used because the page only opens after the sidebar rendered.
      const anchor = findBrowserRoot()
      if (anchor === null) { pageHost = null; return }
      anchor.appendChild(pageHost)
      reactRoot = ReactDOMClient.createRoot(pageHost)
    }
    if (!open && pageHost !== null) {
      reactRoot?.unmount()
      reactRoot = null
      pageHost.remove()
      pageHost = null
    }
    if (open && reactRoot !== null) {
      reactRoot.render(e(OverviewPage, { onBack: () => setSuiteState({ pageOpen: false }) }))
    }
  }

  /** The workspace browser root: the flex container owning the section header. */
  const findBrowserRoot = (): HTMLElement | null => {
    const target = findAddWorkspaceButton()
    if (target === null) return null
    const header = target.closest('div')
    return header?.parentElement ?? null
  }

  const buildButton = (): HTMLButtonElement => {
    const button = document.createElement('button')
    button.type = 'button'
    button.title = 'OpenSpec 项目总览'
    button.setAttribute('aria-label', 'OpenSpec 项目总览')
    Object.assign(button.style, {
      cursor: 'pointer',
      flex: 'none',
      justifyContent: 'center',
      alignItems: 'center',
      padding: '0',
      display: 'inline-flex',
      background: 'transparent',
      border: 'none',
      borderRadius: '50%',
      outline: 'none',
    } satisfies Partial<CSSStyleDeclaration>)
    const hoverOn = (): void => { button.style.background = 'var(--dsw-alias-interactive-bg-hover)' }
    const hoverOff = (): void => { button.style.background = 'transparent' }
    button.addEventListener('mouseenter', hoverOn)
    button.addEventListener('mouseleave', hoverOff)
    button.addEventListener('focus', hoverOn)
    button.addEventListener('blur', hoverOff)
    button.addEventListener('click', () => {
      button.style.background = 'transparent'
      setSuiteState({ pageOpen: !suiteState.pageOpen })
    })
    return button
  }

  const renderIcon = (button: HTMLButtonElement, size: number): void => {
    button.querySelector('svg')?.remove()
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('width', String(size))
    svg.setAttribute('height', String(size))
    svg.setAttribute('viewBox', '0 0 16 16')
    svg.setAttribute('fill', 'none')
    svg.setAttribute('style', 'display:block;flex:none')
    for (const d of ICON_LIST_PEN_PATHS) {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
      path.setAttribute('d', d)
      path.setAttribute('fill', 'currentColor')
      svg.appendChild(path)
    }
    button.appendChild(svg)
  }

  const mount = (): void => {
    if (disposed) return
    const target = findAddWorkspaceButton()
    if (target === null) return
    if (!inWorkspaceHeader(target)) return

    // The add button lives inside a max-width:60px/overflow:hidden action
    // cluster; a sibling inserted THERE is silently clipped. Anchor on the
    // section header strip instead (full width) and append as its last child,
    // which visually lands immediately to the RIGHT of the add button.
    const cluster = target.parentElement
    const anchor = cluster?.parentElement ?? cluster
    if (anchor === null) return
    if (buttonHost !== null && buttonHost.parentElement === anchor && buttonHost.isConnected) return

    const wide = (target.querySelector('svg')?.getAttribute('width') ?? '16') !== '18'
    if (buttonHost === null) {
      buttonHost = document.createElement('div')
      buttonHost.id = HEADER_BTN_ID
      buttonHost.appendChild(buildButton())
    }
    const button = buttonHost.querySelector('button') as HTMLButtonElement | null
    if (button === null) return
    Object.assign(button.style, {
      width: wide ? '28px' : '36px',
      height: wide ? '28px' : '36px',
      color: wide ? 'var(--dsw-alias-label-secondary)' : 'var(--dsw-alias-label-primary)',
    })
    renderIcon(button, wide ? 16 : 18)
    anchor.appendChild(buttonHost)
    placedBeside = target

    // ensure the browser root is a positioning context for the page overlay
    const root = anchor.parentElement ?? anchor
    if (getComputedStyle(root).position === 'static') root.style.position = 'relative'
    // (re)attach the page overlay if it should be open
    if (suiteState.pageOpen && pageHost !== null && pageHost.parentElement !== root) root.appendChild(pageHost)
    syncPage()
  }

  const stateListener = (): void => { syncPage() }
  suiteListeners.add(stateListener)

  observer = new MutationObserver(() => { mount() })
  observer.observe(document.body, { childList: true, subtree: true })
  mount()

  return {
    destroy: (): void => {
      disposed = true
      suiteListeners.delete(stateListener)
      observer?.disconnect()
      observer = null
      reactRoot?.unmount()
      reactRoot = null
      pageHost?.remove()
      pageHost = null
      buttonHost?.remove()
      buttonHost = null
      placedBeside = null
    },
  }
}

export function apply(ctx: Context): void {
  ctx.effect(() => injectSidebar().destroy)
}
