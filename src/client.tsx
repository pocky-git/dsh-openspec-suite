/**
 * dsh-openspec-suite 客户端部分。
 *
 * 1. 在左侧边栏工作区区域的头部，紧跟在“添加工作区”（+）按钮右侧，
 *    注入一个图标按钮（与侧栏“添加工作区”按钮同样的视觉风格，
 *    内联 IconListPenOutline16 SVG）。点击后打开 OpenSpec 总览页（见 2）。
 * 2. 总览页本身是左侧边栏内的一个二级页面：一个覆盖工作区浏览区域
 *    （区域标题 + 会话列表）的浮层，拥有自己的头部（“← 返回” + 标题）
 *    以及已导入项目的只读列表（含每个提案的进度）。项目的增删通过宿主
 *    的工作区管理进行；导入操作在别处完成。
 *
 * 通过同源的 `/openspec/api/*` JSON 信封（{ok, value} / {ok:false, error}）
 * 与宿主部分通信。
 *
 * 样式统一放在 ./client.less，组件里只挂类名。
 */

/** 插件标识。 */
export const name = 'dsh-openspec-suite/client'

import * as React from 'react'
import * as ReactDOMClient from 'react-dom/client'
import type { Context } from './client-context.ts'
import './client.less'

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

interface ImportAllResult {
  root: string
  count: number
  imported: string[]
  existing: string[]
  failed: Array<{ path: string; message: string }>
}

interface PickerState {
  open: boolean
  path: string
  entries: Array<{ name: string; path: string }>
  error: string
}

/** 调用宿主侧 `/openspec/api/*` 接口的统一封装。 */
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

// ── 图标（几何数据取自 @deepseek-ai/dsh-client-ui-primitives，让按钮看起来
//    像原生 UI；currentColor 跟随主题） ────────────────────────────────────

const ICON_LIST_PEN_PATHS = [
  'M10.8239 3.54733V4.78443H4.63437V3.54733H10.8239Z',
  'M10.8239 6.12629V7.36338H4.63437V6.12629H10.8239Z',
  'M9.073 8.70524V9.94234H4.63437V8.70524H9.073Z',
  'M9.13321 0.573526C10.0076 0.573525 10.7179 0.572522 11.285 0.63397C11.8645 0.696791 12.3743 0.831648 12.8193 1.1548C13.0776 1.34246 13.3056 1.57047 13.4933 1.82875C13.8164 2.2737 13.9513 2.7836 14.0141 3.36303C14.0755 3.93015 14.0745 4.64049 14.0745 5.51485V6.1757L12.7327 7.5629V5.51485C12.7327 4.61092 12.732 3.9862 12.6803 3.5081C12.6298 3.0427 12.5379 2.79497 12.4083 2.61654C12.3033 2.47211 12.176 2.34472 12.0315 2.23977C11.8531 2.11016 11.6054 2.01823 11.14 1.96777C10.6618 1.91601 10.0372 1.91539 9.13321 1.91539H6.32658C5.42262 1.91539 4.79796 1.91604 4.31983 1.96777C3.85451 2.01819 3.60672 2.11029 3.42827 2.23977C3.28392 2.34465 3.15643 2.47223 3.0515 2.61654C2.9219 2.79496 2.82997 3.04274 2.7795 3.5081C2.72774 3.9862 2.72712 4.61092 2.72712 5.51485V10.023C2.72712 10.9273 2.72773 11.5525 2.7795 12.0307C2.82992 12.4959 2.92205 12.7429 3.0515 12.9213C3.15645 13.0657 3.28384 13.1931 3.42827 13.2981C3.60676 13.4277 3.85408 13.5206 4.31983 13.5711C4.79797 13.6228 5.42259 13.6234 6.32658 13.6234H6.87057L5.57707 14.9593C5.03527 14.9556 4.57031 14.9467 4.17476 14.9039C3.59508 14.841 3.08558 14.7063 2.64048 14.383C2.38215 14.1953 2.15422 13.9684 1.96653 13.7101C1.64319 13.2649 1.50851 12.7546 1.4457 12.1748C1.38432 11.6076 1.38525 10.8974 1.38525 10.023V5.51485C1.38525 4.64049 1.38426 3.93015 1.4457 3.36303C1.50853 2.78363 1.64341 2.27368 1.96653 1.82875C2.15417 1.57059 2.38228 1.34239 2.64048 1.1548C3.08544 0.831805 3.59533 0.696762 4.17476 0.63397C4.74193 0.572552 5.45218 0.573525 6.32658 0.573526H9.13321 0.573526Z',
  'M14.2193 14.9553H10.0124L11.3744 13.6134H14.2193V14.9553Z',
  'M8.24493 13.3711L7.49015 14.8806C7.40148 15.058 7.58961 15.2461 7.76695 15.1574L9.27651 14.4027L14.6147 9.09934L13.5832 8.06775L8.24493 13.3711Z',
]

/** 列表-笔 图标（16px 线性风格）。 */
function IconListPenOutline16(props: { size?: number }): React.ReactElement {
  const size = props.size ?? 16
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block', flex: 'none' }}>
      {ICON_LIST_PEN_PATHS.map((d, index) => <path key={index} d={d} fill="currentColor" />)}
    </svg>
  )
}

/** 左箭头（返回）图标（14px 线性风格）。 */
function IconChevronLeftOutline14(props: { size?: number }): React.ReactElement {
  const size = props.size ?? 14
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block', flex: 'none' }}>
      <path d="M8.87467 3.40786C9.08815 3.62133 9.08815 3.96753 8.87467 4.18101L6.05568 7L8.87467 9.81899C9.08815 10.0325 9.08815 10.3787 8.87467 10.5921C8.6612 10.8056 8.315 10.8056 8.10152 10.5921L4.87533 7.36594C4.66186 7.15247 4.66186 6.80626 4.87533 6.59279L8.10152 3.3666C8.315 3.15312 8.6612 3.15312 8.87467 3.3666Z" fill="currentColor" />
    </svg>
  )
}

// ── 模块级共享状态（头部按钮与总览页共同驱动） ─────────────────────────────

interface SuiteState {
  /** 递增以让总览页重新加载项目列表。 */
  reloadToken: number
  /** 二级页面当前是否显示。 */
  pageOpen: boolean
}

let suiteState: SuiteState = { reloadToken: 0, pageOpen: false }
const suiteListeners = new Set<() => void>()

/** 更新共享状态并通知所有订阅者。 */
function setSuiteState(patch: Partial<SuiteState>): void {
  suiteState = { ...suiteState, ...patch }
  for (const listener of suiteListeners) listener()
}

/** 在组件中订阅共享状态。 */
function useSuiteState(): SuiteState {
  const [state, setState] = React.useState(suiteState)
  React.useEffect(() => {
    const listener = () => setState(suiteState)
    suiteListeners.add(listener)
    return () => { suiteListeners.delete(listener) }
  }, [])
  return state
}

// ── 总览页（渲染在侧栏浮层内） ─────────────────────────────────────────────

function OverviewPage(props: { onBack: () => void }): React.ReactElement {
  const suite = useSuiteState()
  const [projects, setProjects] = React.useState<ProjectWire[] | null>(null)
  const [error, setError] = React.useState('')
  const [busy, setBusy] = React.useState(false)

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

  const doRemove = async (dir: string): Promise<void> => {
    setBusy(true); setError('')
    try { await call('remove', { path: dir }); reload() }
    catch (err) { setError(String((err as Error).message ?? err)) }
    finally { setBusy(false) }
  }

  // ── ＋ 导入流程（选文件夹 → 扫描并导入其下所有项目） ──

  const [picker, setPicker] = React.useState<PickerState>({ open: false, path: '', entries: [], error: '' })

  const importAllUnder = async (dir: string): Promise<void> => {
    setBusy(true); setError('')
    try {
      const result = await call<ImportAllResult>('scanAndImportAll', { path: dir })
      setSuiteState({ reloadToken: suiteState.reloadToken + 1 })
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
        // 仅支持浏览的宿主：打开应用内目录浏览器降级方案
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

  const browseTo = async (dir: string): Promise<void> => {
    try {
      const listing = await call<{ path: string; entries: Array<{ name: string; path: string }> }>('dir.list', { path: dir })
      setPicker({ open: true, path: listing.path, entries: listing.entries, error: '' })
    } catch (err) { setPicker((p) => ({ ...p, error: String((err as Error).message ?? err) })) }
  }

  return (
    <div className="oss-page">
      <div className="oss-page-header">
        <button className="oss-back-btn" type="button" title="返回工作区" aria-label="返回工作区" onClick={props.onBack}>
          <IconChevronLeftOutline14 size={14} />
        </button>
        <span className="oss-page-title">OpenSpec 项目总览</span>
        <div className="oss-grow" />
        <button className="oss-back-btn" type="button" title="选择文件夹导入" aria-label="选择文件夹导入" disabled={busy} onClick={() => void startImport()}>
          <span className="oss-plus-icon">＋</span>
        </button>
      </div>
      <div className="oss-page-body">
        {picker.error !== '' && <div className="oss-err">{picker.error}</div>}
        {picker.open && (
          <div className="oss-card oss-picker">
            <div className="oss-row">
              <button className="oss-btn" onClick={() => void browseTo(parentOf(picker.path))}>↑ 上级</button>
              <span className="oss-muted">{picker.path || '~'}</span>
            </div>
            {picker.entries.length === 0 && <div className="oss-muted">（无子目录）</div>}
            {picker.entries
              .filter((entry) => !entry.name.startsWith('.'))
              .map((entry) => (
                <div key={entry.path} className="oss-dir-entry" onClick={() => void browseTo(entry.path)}>
                  📁 {entry.name}
                </div>
              ))}
            <div className="oss-row oss-picker-actions">
              <button className="oss-btn-primary" disabled={busy} onClick={() => void importAllUnder(picker.path)}>
                {busy ? '导入中…' : '导入此目录下所有项目'}
              </button>
              <button className="oss-btn" onClick={() => setPicker((p) => ({ ...p, open: false }))}>取消</button>
            </div>
          </div>
        )}
        {error !== '' && <div className="oss-err">{error}</div>}
        {projects === null ? (
          <div className="oss-muted">加载中…</div>
        ) : (
          <div className="oss-project-list">
            {projects.length === 0 && <div className="oss-muted">还没有导入项目。</div>}
            {projects.map((project) => {
              const totalTasks = project.changes.reduce((sum, change) => sum + change.tasks.total, 0)
              const doneTasks = project.changes.reduce((sum, change) => sum + change.tasks.done, 0)
              const pct = totalTasks === 0 ? 0 : Math.round((doneTasks / totalTasks) * 100)
              return (
                <div key={project.path} className="oss-card">
                  <div className="oss-row oss-project-head">
                    <span className="oss-h">{project.name}</span>
                    <button className="oss-btn oss-btn-mini" onClick={() => void doRemove(project.path)} title="从工作区和列表同时移除">移除</button>
                  </div>
                  <div className="oss-muted oss-ellipsis">{project.path}</div>
                  {!project.stillValid && <div className="oss-muted oss-warn">⚠ openspec/ 目录已不存在</div>}
                  <div className="oss-row">
                    <div className="oss-bar">
                      <div className="oss-bar-fill" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="oss-muted oss-nowrap">{doneTasks}/{totalTasks} 任务 · {pct}%</span>
                  </div>
                  {project.changes.length === 0
                    ? <div className="oss-muted">无活跃提案</div>
                    : project.changes.map((change) => {
                      const artifacts = (['proposal', 'design', 'specs', 'tasks'] as const)
                        .map((key) => change.artifacts[key] ? key : null).filter((v) => v !== null)
                      return (
                        <div key={change.name} className="oss-entry">
                          <span className={change.tasks.total > 0 && change.tasks.done === change.tasks.total ? 'oss-dot is-done' : 'oss-dot is-doing'} />
                          <span className="oss-ellipsis" style={{ flex: 1, minWidth: 0 }}>{change.name}</span>
                          <span className="oss-muted oss-nowrap">
                            {artifacts.join('·')} {change.tasks.total > 0 ? `(${change.tasks.done}/${change.tasks.total})` : ''}
                          </span>
                        </div>
                      )
                    })}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

/** 取路径的父目录（以 / 分隔）。 */
function parentOf(path: string): string {
  const normalized = path.replace(/\/+$/u, '')
  if (normalized === '' || normalized === '/') return '/'
  const cut = normalized.lastIndexOf('/')
  return cut <= 0 ? '/' : normalized.slice(0, cut)
}

// ── 侧栏注入：入口按钮 + 二级页面浮层 ──────────────────────────────────────

const HEADER_BTN_ID = 'openspec-suite-overview-btn'
const PAGE_HOST_ID = 'openspec-suite-page-host'

/**
 * 查找工作区区域头部的“添加工作区”图标按钮（一个圆角 28px/36px 图标按钮，
 * 内含 IconProjectAddOutline16 几何的 svg）。侧栏渲染出该按钮之前返回 null。
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
    // 必须看起来是圆形图标按钮（工作区头部样式）
    const radius = window.getComputedStyle(button).borderRadius
    const round = radius === '50%' || radius.endsWith('px') && parseFloat(radius) >= 10
    if (!round) continue
    // 不能在我们自己的页面浮层内
    if (button.closest(`[data-openspec-suite-panel]`) !== null) continue
    return button as HTMLButtonElement
  }
  return null
}

/** 按钮是否位于侧栏的工作区列表头部（而不是例如菜单传送门里）。 */
function inWorkspaceHeader(button: HTMLButtonElement): boolean {
  const svgSize = button.querySelector('svg')?.getAttribute('width') ?? ''
  return svgSize === '16' || svgSize === '18'
}

interface SidebarInjection {
  destroy: () => void
}

/**
 * 把入口按钮注入工作区区域头部，并管理二级页面浮层（打开时渲染到
 * 工作区浏览器根节点里，覆盖标题 + 会话列表）。
 */
function injectSidebar(): SidebarInjection {
  let buttonHost: HTMLDivElement | null = null
  let placedBeside: HTMLButtonElement | null = null
  let pageHost: HTMLDivElement | null = null
  let reactRoot: ReactDOMClient.Root | null = null
  let observer: MutationObserver | null = null
  let disposed = false

  /** 根据共享状态渲染（或拆除）页面浮层。 */
  const syncPage = (): void => {
    if (disposed) return
    const open = suiteState.pageOpen
    // 页面需要依附侧栏 DOM；挂载位置在 mount() 里尽力完成，但只要宿主
    // 节点存在，React 树本身就可以渲染。
    if (open && pageHost === null) {
      pageHost = document.createElement('div')
      pageHost.id = PAGE_HOST_ID
      pageHost.setAttribute('data-openspec-suite-panel', '1')
      Object.assign(pageHost.style, { position: 'absolute', inset: '0', zIndex: '20' } satisfies Partial<CSSStyleDeclaration>)
      // 依附到工作区浏览器根节点；不会退回 body，因为页面只在侧栏
      // 渲染完成后才打开。
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
      reactRoot.render(<OverviewPage onBack={() => setSuiteState({ pageOpen: false })} />)
    }
  }

  /** 工作区浏览器根节点：持有区域标题的 flex 容器。 */
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
    button.className = 'oss-entry-btn'
    button.addEventListener('click', () => {
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

    // 添加按钮位于一个 max-width:60px/overflow:hidden 的动作簇里；
    // 插在那里的兄弟节点会被静默裁剪。改为锚定在区域标题条（整宽）上，
    // 作为其最后一个子节点追加，视觉上正好落在添加按钮右侧。
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
    button.className = `oss-entry-btn ${wide ? 'is-wide' : 'is-narrow'}`
    renderIcon(button, wide ? 16 : 18)
    anchor.appendChild(buttonHost)
    placedBeside = target

    // 确保浏览器根节点成为页面浮层的定位上下文
    const root = anchor.parentElement ?? anchor
    if (getComputedStyle(root).position === 'static') root.style.position = 'relative'
    // 页面浮层应当打开时重新依附
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

/** 插件入口：注册侧栏注入，随上下文销毁时清理。 */
export function apply(ctx: Context): void {
  ctx.effect(() => injectSidebar().destroy)
}
