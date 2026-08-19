/**
 * dsh-openspec-suite 客户端部分。
 *
 * 1. 在左侧边栏根部，“新建会话”按钮与工作区浏览区域之间，
 *    注入一个“图标 + 文字”按钮（宽模式下显示图标与 OpenSpec 文字，
 *    窄/rail 模式下仅显示图标）。点击后打开 OpenSpec 总览页（见 2）。
 * 2. 总览页本身是左侧边栏内的一个二级页面：一个覆盖工作区浏览区域
 *    （区域标题 + 会话列表）的浮层，拥有自己的头部（“← 返回” + 标题）
 *    以及已导入项目的只读列表。每个项目带“创建提案”按钮（新建会话并
 *    预填 /openspec-new-change 命令）；每个提案行点击行首定位到该
 *    提案的会话，展开可查看产物清单；已归档提案保留归档日期。
 *
 * 通过同源的 `/openspec/api/*` JSON 信封（{ok, value} / {ok:false, error}）
 * 与宿主部分通信。
 *
 * 样式统一放在 ./client.less，组件里只挂类名。
 */

/** 插件标识。 */
export const name = 'dsh-openspec-suite/client'

/**
 * 必选依赖：dsh-better-sidebar（产物打开到侧栏编辑器 + 注册 HTML
 * 预览器）、dsh-client-runtime 的 sessions / workspaces（会话定位与
 * 新建提案会话）。dsh web 运行时不支持 'xxx?' 可选注入语法（会把
 * 'xxx?' 当成字面服务名等待，导致插件永远 pending），所以要么必选
 * 要么运行时 ctx.get 懒读。conversation 服务用 ctx.get 懒读。
 */
export const inject = ['betterSidebar', 'sessions', 'workspaces']

import * as React from 'react'
import * as ReactDOMClient from 'react-dom/client'
import type { Context } from './client-context.ts'
import './client.less'

/**
 * 当前插件上下文（apply 时捕获）。用于跨插件服务调用——dsh-better-sidebar
 * 的 ctx.betterSidebar.openFile（把产物打开到侧栏编辑器）、dsh-client-runtime
 * 的 ctx.sessions / ctx.workspaces（会话定位与新建提案会话）。
 */
let pluginContext: Context | undefined

/** 提案的会话定位：打开该会话并返回其 id。 */
function openSession(sessionId: string): boolean {
  const ctx = pluginContext
  if (ctx === undefined) return false
  try {
    ctx.sessions.open(sessionId)
    return true
  } catch {
    return false
  }
}

/**
 * 为当前打开的会话预填 composer 草稿（如 /openspec-new-change）。
 * 会话必须刚被 sessions.open 选中。成功返回 true。
 */
function prefillDraft(text: string): boolean {
  const ctx = pluginContext
  if (ctx === undefined) return false
  try {
    const current = ctx.sessions.list.getSnapshot().current
    if (current === undefined) return false
    const scoped = ctx.sessions.scope(current)
    if (scoped === undefined) return false
    // conversation 是跨插件服务：inject 声明属 dsh-client-ui-conversation
    // 的消费面，这里按 better-sidebar 的同款模式用 ctx.get 懒读。
    const conversation = ctx.get('conversation') as { input: { for(actx: unknown): { setDraft(t: string): void } } } | undefined
    if (conversation === undefined) return false
    conversation.input.for(scoped).setDraft(text)
    return true
  } catch {
    return false
  }
}

/**
 * 把文件打开到 dsh-better-sidebar 的编辑器 tab。成功打开返回
 * true；无活动会话或调用失败返回 false（调用方回退应用内预览）。
 */
function openInBetterSidebar(path: string, title: string): boolean {
  const ctx = pluginContext
  if (ctx === undefined) return false
  try {
    const sessionId = ctx.betterSidebar.getSnapshot().sessionId
    if (sessionId === undefined || sessionId === '') return false
    ctx.betterSidebar.openFile({ sessionId }, path, title)
    return true
  } catch {
    return false
  }
}

interface OpenSpecArtifactFileWire {
  kind: string
  label: string
  path: string
  bytes: number
  mtime: string
}

interface OpenSpecExpectedArtifactWire {
  id: string
  satisfied: boolean
}

/** 提案生命周期状态（与宿主 ChangeStatus 对应）。 */
type ChangeStatusWire = 'designing' | 'ready' | 'applying' | 'done' | 'archived'

interface OpenSpecChangeWire {
  name: string
  status: ChangeStatusWire
  tasks: { done: number; total: number }
  files: OpenSpecArtifactFileWire[]
  expected: OpenSpecExpectedArtifactWire[]
  /** 归档日期（YYYY-MM-DD；仅已归档）。 */
  archivedAt?: string
}

interface ProjectWire {
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

/** 左箭头（返回）图标（14px 线性风格）。 */
function IconChevronLeftOutline14(props: { size?: number }): React.ReactElement {
  const size = props.size ?? 14
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block', flex: 'none' }}>
      <path d="M8.87467 3.40786C9.08815 3.62133 9.08815 3.96753 8.87467 4.18101L6.05568 7L8.87467 9.81899C9.08815 10.0325 9.08815 10.3787 8.87467 10.5921C8.6612 10.8056 8.315 10.8056 8.10152 10.5921L4.87533 7.36594C4.66186 7.15247 4.66186 6.80626 4.87533 6.59279L8.10152 3.3666C8.315 3.15312 8.6612 3.15312 8.87467 3.3666Z" fill="currentColor" />
    </svg>
  )
}

/** 右箭头（展开指示）图标（线性风格；容器旋转 90° 表示展开）。 */
function IconChevronRightOutline12(props: { size?: number }): React.ReactElement {
  const size = props.size ?? 12
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block', flex: 'none' }}>
      <path d="M5.12533 3.40786C4.91185 3.62133 4.91185 3.96753 5.12533 4.18101L7.94432 7L5.12533 9.81899C4.91185 10.0325 4.91185 10.3787 5.12533 10.5921C5.3388 10.8056 5.685 10.8056 5.89848 10.5921L9.12467 7.36594C9.33814 7.15247 9.33814 6.80626 9.12467 6.59279L5.89848 3.3666C5.685 3.15312 5.3388 3.15312 5.12533 3.3666Z" fill="currentColor" />
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

// ── 提案 → 会话匹配 ─────────────────────────────────────────────────────────

/**
 * 从项目会话列表中找出该提案对应的会话：
 * 1. overview 带回的绑定标记（提案目录内 .dsh-session 文件），
 *    绑定仍在本项目会话列表内才有效；
 * 2. overview 数据里没有时（例如提案目录刚出现、总览页还没重新
 *    加载），向宿主查一次 changeSession.get——宿主会先做待绑定
 *    对账再读标记文件；
 * 3. 回退第一个会话（绑定不存在或已失效时）；
 * 4. 没有任何会话则 undefined。
 */
async function findChangeSession(project: ProjectWire, changeName: string): Promise<string | undefined> {
  if (project.sessionIds.length === 0) return undefined
  const tryBound = (sessionId: string): string | undefined =>
    project.sessionIds.includes(sessionId) ? sessionId : undefined
  const local = project.changeSessions[changeName]
  if (local !== undefined) {
    const hit = tryBound(local)
    if (hit !== undefined) return hit
  }
  // overview 快照里没有有效绑定：让宿主现场对账 + 读标记文件。
  try {
    const result = await call<{ sessionId: string | null }>('changeSession.get', { projectPath: project.path, changeName })
    if (result.sessionId !== null) {
      const hit = tryBound(result.sessionId)
      if (hit !== undefined) return hit
    }
  } catch { /* 宿主查询失败，走兜底 */ }
  return project.sessionIds[0]
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

  /** 创建提案：为该项目新建 agent 会话并预填 /openspec-new-change。 */
  const startNewChange = async (project: ProjectWire): Promise<void> => {
    const ctx = pluginContext
    if (ctx === undefined) return
    setBusy(true); setError('')
    try {
      const before = new Set(project.sessionIds)
      ctx.workspaces.startSession(project.workspaceId)
      // 新会话经 wire 建立需要一点时间；轮询至多约 2 秒等 current
      // 变成该项目下的一个新会话后再预填草稿。
      let newSessionId: string | undefined
      for (let attempt = 0; attempt < 20; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 100))
        const current = ctx.sessions.list.getSnapshot().current
        // current 变成不在旧会话集合里的会话 = 新会话已就绪。
        if (current !== undefined && !before.has(current)) { newSessionId = current; break }
      }
      if (!prefillDraft('/openspec-new-change ')) {
        setError('已新建会话，但未能预填命令（可手动输入 /openspec-new-change）')
      }
      // 记录提案 → 会话待绑定：此刻提案目录尚不存在（命令只是预填
      // 草稿）。宿主记下点击时刻，之后对账时把 birthtime 晚于该时刻
      // 的新提案目录绑给这个会话（写入提案目录内 .dsh-session 标记）。
      if (newSessionId !== undefined) {
        await call('changeSession.bind', {
          projectPath: project.path,
          sessionId: newSessionId,
        }).catch(() => undefined)
      }
      setSuiteState({ pageOpen: false })
    } finally {
      setBusy(false)
    }
  }

  // ── ＋ 导入流程（选文件夹 → 扫描并导入其下所有项目） ──

  const [picker, setPicker] = React.useState<PickerState>({ open: false, path: '', entries: [], error: '' })
  const [preview, setPreview] = React.useState<FilePreviewState | null>(null)

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
          <IconChevronLeftOutline14 size={18} />
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
              const active = project.changes.filter((c) => c.status !== 'archived')
              const archived = project.changes.filter((c) => c.status === 'archived')
              return (
                <div key={project.path} className="oss-card">
                  <div className="oss-row oss-project-head">
                    <span className="oss-h">{project.name}</span>
                    <div className="oss-grow" />
                    <button
                      className="oss-btn oss-btn-mini"
                      disabled={busy}
                      title="新建会话并输入 /openspec-new-change"
                      onClick={() => void startNewChange(project)}
                    >
                      创建提案
                    </button>
                    <button className="oss-btn oss-btn-mini" onClick={() => void doRemove(project.path)} title="从工作区和列表同时移除">移除</button>
                  </div>
                  <div className="oss-muted oss-ellipsis">{project.path}</div>
                  {!project.stillValid && <div className="oss-muted oss-warn">⚠ openspec/ 目录已不存在</div>}
                  {active.length === 0 && archived.length === 0 && <div className="oss-muted">无提案</div>}
                  {active.map((change) => (
                    <ChangeRow
                      key={change.name}
                      change={change}
                      project={project}
                      onOpenFile={(file, changeName) => {
                        // 优先打开到 dsh-better-sidebar 编辑器（HTML 由本
                        // 插件注册的高优先级预览器接管，走自己的 raw 路由，
                        // 不受会话 cwd 栅栏限制）；不可用时回退应用内预览。
                        if (openInBetterSidebar(file.path, `${changeName}/${file.label}`)) return
                        setPreview({ change: changeName, file, projectPath: project.path })
                      }}
                      onLocate={(changeName) => { void (async () => {
                        const sessionId = await findChangeSession(project, changeName)
                        if (sessionId === undefined) {
                          setError(`找不到提案「${changeName}」对应的会话`)
                          return
                        }
                        if (openSession(sessionId)) setSuiteState({ pageOpen: false })
                        else setError('会话服务不可用，无法定位')
                      })() }}
                    />
                  ))}
                  {archived.length > 0 && <ArchivedSection changes={archived} project={project} onOpenFile={(file, changeName) => {
                    if (openInBetterSidebar(file.path, `${changeName}/${file.label}`)) return
                    setPreview({ change: changeName, file, projectPath: project.path })
                  }} onLocate={(changeName) => { void (async () => {
                    const sessionId = await findChangeSession(project, changeName)
                    if (sessionId !== undefined && openSession(sessionId)) setSuiteState({ pageOpen: false })
                  })() }} />}
                </div>
              )
            })}
          </div>
        )}
      </div>
      {preview !== null && (
        <div className="oss-preview-overlay">
          <FilePreview state={preview} onBack={() => setPreview(null)} />
        </div>
      )}
    </div>
  )
}

// ── Markdown 预览（三级浮层，覆盖在总览页内部） ───────────────────────────

interface FilePreviewState {
  change: string
  file: OpenSpecArtifactFileWire
  /** 项目根目录（用于构造 iframe raw URL）。 */
  projectPath: string
}

/** 调用 file.read 拉取内容。 */
function useFileContent(path: string): { content: string | null; error: string } {
  const [content, setContent] = React.useState<string | null>(null)
  const [error, setError] = React.useState('')
  React.useEffect(() => {
    if (path === '') return
    const controller = new AbortController()
    setContent(null); setError('')
    call<{ content: string }>('file.read', { path }, controller.signal)
      .then((value) => setContent(value.content))
      .catch((err) => { if (err.name !== 'AbortError') setError(String((err as Error).message ?? err)) })
    return () => controller.abort()
  }, [path])
  return { content, error }
}

/**
 * 极简安全 Markdown 渲染：先整体 HTML 转义再做行级/内联替换，
 * 输出受限标签集合（标题/列表/代码块/复选框/粗体/行内代码），
 * 不引入完整 markdown 依赖，也不会注入任意 HTML。
 */
function renderMarkdown(md: string): string {
  const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  const inline = (s: string): string => esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  const lines = md.split(/\r?\n/u)
  const out: string[] = []
  let inCode = false
  let listOpen = false
  const closeList = (): void => { if (listOpen) { out.push('</ul>'); listOpen = false } }
  for (const raw of lines) {
    if (raw.startsWith('```')) {
      closeList()
      out.push(inCode ? '</code></pre>' : '<pre class="oss-md-pre"><code>')
      inCode = !inCode
      continue
    }
    if (inCode) { out.push(`${esc(raw)}\n`); continue }
    const heading = /^(#{1,4})\s+(.*)$/u.exec(raw)
    if (heading !== null) {
      closeList()
      const level = heading[1]!.length
      out.push(`<h${level} class="oss-md-h${level}">${inline(heading[2]!)}</h${level}>`)
      continue
    }
    const task = /^\s*[-*]\s+\[( |x|X)\]\s+(.*)$/u.exec(raw)
    if (task !== null) {
      if (!listOpen) { out.push('<ul class="oss-md-ul">'); listOpen = true }
      const checked = task[1] !== ' '
      out.push(`<li class="oss-md-task ${checked ? 'is-done' : ''}"><span class="oss-md-check">${checked ? '☑' : '☐'}</span>${inline(task[2]!)}</li>`)
      continue
    }
    const bullet = /^\s*[-*]\s+(.*)$/u.exec(raw)
    if (bullet !== null) {
      if (!listOpen) { out.push('<ul class="oss-md-ul">'); listOpen = true }
      out.push(`<li>${inline(bullet[1]!)}</li>`)
      continue
    }
    closeList()
    if (raw.trim() === '') continue
    out.push(`<p class="oss-md-p">${inline(raw)}</p>`)
  }
  closeList()
  if (inCode) out.push('</code></pre>')
  return out.join('')
}

/** 构造 iframe 用的原始文件 URL（需 projectPath 定位工作区）。 */
function rawFileUrl(projectPath: string, filePath: string): string {
  const relPath = filePath.startsWith(`${projectPath}/`) ? filePath.slice(projectPath.length + 1) : filePath
  // btoa 不接受非 Latin1 字符（中文项目路径）；先按 UTF-8 字节编码。
  const wsId = btoa(String.fromCharCode(...new TextEncoder().encode(projectPath)))
  return `/openspec/api/raw/${encodeURIComponent(wsId)}/${relPath.split('/').map(encodeURIComponent).join('/')}`
}

/** 是否用 iframe 预览（交互式 HTML 产物）。 */
function isHtmlFile(filePath: string): boolean {
  return /\.html?$/iu.test(filePath)
}

function FilePreview(props: { state: FilePreviewState; onBack: () => void }): React.ReactElement {
  const { state } = props
  const html = isHtmlFile(state.file.path)
  const { content, error } = useFileContent(html ? '' : state.file.path)
  return (
    <div className="oss-preview">
      <div className="oss-page-header">
        <button className="oss-back-btn" type="button" title="返回产物列表" aria-label="返回产物列表" onClick={props.onBack}>
          <IconChevronLeftOutline14 size={14} />
        </button>
        <span className="oss-page-title oss-ellipsis">{state.file.label}</span>
        <div className="oss-grow" />
      </div>
      <div className="oss-preview-meta oss-muted">
        <span className="oss-ellipsis">{state.change} / {state.file.label}</span>
        <span className="oss-nowrap">{formatBytes(state.file.bytes)} · {formatMtime(state.file.mtime)}</span>
      </div>
      <div className="oss-preview-body">
        {error !== '' && <div className="oss-err">{error}</div>}
        {html ? (
          <iframe
            className="oss-preview-frame"
            src={rawFileUrl(state.projectPath, state.file.path)}
            title={state.file.label}
            sandbox="allow-scripts"
          />
        ) : (
          <>
            {content === null && error === '' && <div className="oss-muted">加载中…</div>}
            {content !== null && (
              <div className="oss-md" dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }} />
            )}
          </>
        )}
      </div>
    </div>
  )
}

/** 下拉列表中的一行：一个已生成文件，或一个未生成的期望产物。 */
interface ArtifactRow {
  key: string
  /** 已生成时可预览的文件；未生成时为 null。 */
  file: OpenSpecArtifactFileWire | null
  /** 展示标题：文件相对路径或产物 id。 */
  label: string
}

/**
 * 把 change 的文件与 schema 期望产物合并成下拉行：按 schema 顺序
 * 排列每个产物阶段，已生成的展示其文件（一个阶段可能多个文件，
 * 如 specs/**），未生成的展示 ○ 占位行。
 */
function buildArtifactRows(change: OpenSpecChangeWire): ArtifactRow[] {
  const rows: ArtifactRow[] = []
  for (const artifact of change.expected) {
    const matches = change.files.filter((file) => file.kind === artifact.id)
    if (matches.length > 0) {
      for (const file of matches) {
        rows.push({ key: file.path, file, label: file.label })
      }
    } else {
      rows.push({ key: `missing:${artifact.id}`, file: null, label: artifact.id })
    }
  }
  return rows
}

/** 已归档提案的折叠区（默认收起）。 */
function ArchivedSection(props: {
  changes: OpenSpecChangeWire[]
  project: ProjectWire
  onOpenFile: (file: OpenSpecArtifactFileWire, change: string) => void
  onLocate: (change: string) => void
}): React.ReactElement {
  const [open, setOpen] = React.useState(false)
  return (
    <div className="oss-archived">
      <div
        className="oss-entry oss-entry-clickable oss-archived-head"
        role="button"
        tabIndex={0}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen((v) => !v) } }}
      >
        <span className={`oss-caret ${open ? 'is-open' : ''}`}>
          <IconChevronRightOutline12 size={12} />
        </span>
        <span className="oss-muted" style={{ flex: 1, minWidth: 0 }}>已归档（{props.changes.length}）</span>
      </div>
      {open && props.changes.map((change) => (
        <ChangeRow key={change.name} change={change} project={props.project} onOpenFile={props.onOpenFile} onLocate={props.onLocate} />
      ))}
    </div>
  )
}

/** 单个 change 卡片行：定位会话 + 产物下拉；已归档提案保留归档日期。 */
function ChangeRow(props: {
  change: OpenSpecChangeWire
  project: ProjectWire
  onOpenFile: (file: OpenSpecArtifactFileWire, change: string) => void
  onLocate: (change: string) => void
}): React.ReactElement {
  const [expanded, setExpanded] = React.useState(false)
  const { change } = props
  const rows = buildArtifactRows(change)
  const hasContent = rows.length > 0
  const archived = change.status === 'archived'
  return (
    <div className={`oss-change ${archived ? 'is-archived' : ''}`}>
      <div
        className="oss-entry oss-entry-clickable"
        onClick={() => { if (hasContent) setExpanded((v) => !v) }}
        role={hasContent ? 'button' : undefined}
        tabIndex={hasContent ? 0 : undefined}
        onKeyDown={(e) => { if (hasContent && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setExpanded((v) => !v) } }}
      >
        <span className={`oss-caret ${expanded ? 'is-open' : ''} ${hasContent ? '' : 'is-hidden'}`}>
          <IconChevronRightOutline12 size={12} />
        </span>
        <span
          className="oss-ellipsis oss-change-name"
          style={{ flex: 1, minWidth: 0 }}
          title="点击定位到该提案的会话"
          onClick={(e) => { e.stopPropagation(); props.onLocate(change.name) }}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); props.onLocate(change.name) } }}
          role="button"
          tabIndex={0}
        >{change.name}</span>
        {archived && change.archivedAt !== undefined && (
          <span className="oss-muted oss-nowrap">{change.archivedAt}</span>
        )}
      </div>
      {expanded && (
        <div className="oss-files">
          {rows.map((row) => row.file !== null ? (
            <div
              key={row.key}
              className="oss-file"
              role="button"
              tabIndex={0}
              title={`${row.label} · ${formatBytes(row.file.bytes)} · ${formatMtime(row.file.mtime)}`}
              onClick={() => props.onOpenFile(row.file!, change.name)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); props.onOpenFile(row.file!, change.name) } }}
            >
              <span className="oss-file-status is-done" title="已生成">✓</span>
              <span className="oss-ellipsis" style={{ flex: 1, minWidth: 0 }}>{row.label}</span>
              <span className="oss-muted oss-nowrap">{formatBytes(row.file.bytes)}</span>
            </div>
          ) : (
            <div key={row.key} className="oss-file is-missing" title="未生成">
              <span className="oss-file-status is-missing">○</span>
              <span className="oss-ellipsis" style={{ flex: 1, minWidth: 0 }}>{row.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** 字节数的紧凑展示。 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`
}

/** mtime 的本地紧凑展示。 */
function formatMtime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
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
 * 查找侧栏根部的“新建会话”按钮。注意：logo 行的品牌按钮 aria-label
 * 也是“新建会话”，需排除——真正的“新建会话”按钮的父容器（侧栏根）
 * 里同时存在“添加工作区”按钮，logo 行没有。
 * 侧栏渲染出该按钮之前返回 null。
 */
function findNewSessionButton(): HTMLButtonElement | null {
  for (const button of document.querySelectorAll('button')) {
    if (button.closest(`#${PAGE_HOST_ID}`) !== null) continue
    if (button.getAttribute('aria-label') !== '新建会话') continue
    if (button.querySelector('svg') === null) continue
    const parent = button.parentElement
    if (parent === null || parent.querySelector('button[aria-label="添加工作区"]') === null) continue
    return button as HTMLButtonElement
  }
  return null
}

/** 收起态下位于侧栏外的“打开侧边栏”开关按钮。 */
function findExpandToggle(): HTMLButtonElement | null {
  for (const button of document.querySelectorAll('button')) {
    if (button.getAttribute('aria-label') !== '打开侧边栏') continue
    return button as HTMLButtonElement
  }
  return null
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

  /** 工作区浏览器根节点：侧栏根容器内、包含“添加工作区”按钮的区域。 */
  const findBrowserRoot = (): HTMLElement | null => {
    const newSession = findNewSessionButton()
    if (newSession === null) return null
    const sidebarRoot = newSession.parentElement
    if (sidebarRoot === null) return null
    for (const child of sidebarRoot.children) {
      if (child === newSession || !(child instanceof HTMLElement)) continue
      if (child.querySelector('button[aria-label="添加工作区"]') !== null) return child
    }
    return null
  }

  const buildButton = (): HTMLButtonElement => {
    const button = document.createElement('button')
    button.type = 'button'
    button.title = 'OpenSpec 项目总览'
    button.setAttribute('aria-label', 'OpenSpec 项目总览')
    button.className = 'oss-entry-btn'
    button.addEventListener('click', () => {
      // 收起态点击：先展开侧边栏，再打开总览页（总览页浮层依附于侧栏 DOM）。
      if (findNewSessionButton()?.parentElement !== null
        && (findNewSessionButton()?.parentElement?.getBoundingClientRect().width ?? 0) <= 120) {
        findExpandToggle()?.click()
      }
      setSuiteState({ pageOpen: true })
    })
    return button
  }

  const renderContent = (button: HTMLButtonElement, wide: boolean, iconSize: number): void => {
    button.textContent = ''
    renderIcon(button, iconSize)
    if (wide) {
      const label = document.createElement('span')
      label.className = 'oss-entry-label'
      label.textContent = 'OpenSpec 项目总览'
      button.appendChild(label)
    }
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
    // 锚定在侧栏根容器里：“新建会话”按钮之后、工作区区域（regionArea）之前。
    const newSession = findNewSessionButton()
    if (newSession === null) return
    const sidebarRoot = newSession.parentElement
    if (sidebarRoot === null) return

    // 宽/窄（rail）模式判定：直接以侧栏根容器的渲染宽度为准。
    // 展开约 280px；收起（rail）后收缩为图标列（远小于 120px）。
    const sidebarWidth = sidebarRoot.getBoundingClientRect().width
    sidebarWidthRef = sidebarWidth
    const wide = sidebarWidth > 120

    const placed = buttonHost !== null && buttonHost.parentElement === sidebarRoot && buttonHost.isConnected
    if (buttonHost === null) {
      buttonHost = document.createElement('div')
      buttonHost.id = HEADER_BTN_ID
      buttonHost.appendChild(buildButton())
    }
    const button = buttonHost.querySelector('button') as HTMLButtonElement | null
    if (button === null) return
    // 宿主 div 的模式随宽窄切换：宽模式是占满一行的行盒子；
    // rail 模式收缩为自适应内容（按钮成为居中的图标方块）。
    buttonHost.setAttribute('data-mode', wide ? 'wide' : 'rail')
    buttonHost.style.display = ''
    const nextClass = `oss-entry-btn ${wide ? 'is-wide' : 'is-narrow'}`
    if (placed && button.className === nextClass && buttonHost.previousElementSibling === newSession) return
    button.className = nextClass
    renderContent(button, wide, wide ? 16 : 18)
    if (!placed || buttonHost.previousElementSibling !== newSession) {
      sidebarRoot.insertBefore(buttonHost, newSession.nextSibling)
    }

    // 确保侧栏根节点成为页面浮层的定位上下文
    const root = sidebarRoot
    if (getComputedStyle(root).position === 'static') root.style.position = 'relative'
    // 页面浮层应当在打开时重新依附
    if (suiteState.pageOpen && pageHost !== null && pageHost.parentElement !== root) root.appendChild(pageHost)
    syncPage()
  }

  const stateListener = (): void => { syncPage() }
  suiteListeners.add(stateListener)

  // 收起/展开侧栏是类名与样式变化，不产生 childList 变更；
  // 必须同时监听属性，并在过渡动画期间用 rAF 跟踪宽度直到稳定。
  let rafHandle = 0
  let sidebarWidthRef = 0
  const scheduleMount = (): void => {
    if (rafHandle !== 0) return
    rafHandle = requestAnimationFrame(() => {
      rafHandle = 0
      mount()
      // 过渡动画期间宽度持续变化，动画结束（宽度稳定）后再校准一次。
      const prevWidth = sidebarWidthRef
      const nextWidth = findNewSessionButton()?.parentElement?.getBoundingClientRect().width ?? prevWidth
      if (Math.abs(nextWidth - prevWidth) > 0.5) {
        rafHandle = requestAnimationFrame(() => { rafHandle = 0; mount() })
      }
    })
  }

  observer = new MutationObserver(() => { scheduleMount() })
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'style', 'hidden'],
  })
  mount()

  return {
    destroy: (): void => {
      disposed = true
      suiteListeners.delete(stateListener)
      observer?.disconnect()
      observer = null
      if (rafHandle !== 0) { cancelAnimationFrame(rafHandle); rafHandle = 0 }
      reactRoot?.unmount()
      reactRoot = null
      pageHost?.remove()
      pageHost = null
      buttonHost?.remove()
      buttonHost = null
    },
  }
}

// ── better-sidebar 上的 OpenSpec HTML 预览器 ───────────────────────────────

/**
 * openspec 产物的 HTML 预览器组件：把绝对路径经宿主 raw.url 解析成
 * 本插件自己的 /openspec/api/raw/ URL（栅栏是"已注册工作区的
 * openspec/ 目录"，与当前会话 cwd 无关），在沙箱 iframe 中渲染。
 * 这样 design.html 及其相对依赖（../../mermaid.min.js）始终可用，
 * 不会触发 better-sidebar 内置 /sidebar/html 路由的会话 cwd 栅栏。
 */
function OpenSpecHtmlViewer(props: { path: string; title: string }): React.ReactElement | null {
  const [url, setUrl] = React.useState('')
  const [error, setError] = React.useState('')
  React.useEffect(() => {
    const controller = new AbortController()
    setUrl(''); setError('')
    call<{ url: string }>('raw.url', { path: props.path }, controller.signal)
      .then((value) => setUrl(value.url))
      .catch((err) => { if (err.name !== 'AbortError') setError(String((err as Error).message ?? err)) })
    return () => controller.abort()
  }, [props.path])
  if (error !== '') return <div className="oss-err">{error}</div>
  if (url === '') return <div className="oss-muted">加载中…</div>
  return <iframe className="oss-preview-frame" src={url} title={props.title} sandbox="allow-scripts" />
}

/** 在 dsh-better-sidebar 上注册 OpenSpec HTML 预览器（优先级高于内置）。 */
function registerSidebarViewers(ctx: Context): (() => void) | undefined {
  const register = ctx.betterSidebar.registerFileViewer
  if (register === undefined) return undefined
  try {
    return register({
      id: 'openspec-suite:html',
      title: 'OpenSpec HTML',
      exts: ['html', 'htm'],
      // 内置 html 预览器优先级为 0；这里以更高优先级接管 html 文件。
      priority: 10,
      fetchStrategy: 'none',
      component: (props: { path: string; title: string }) => <OpenSpecHtmlViewer path={props.path} title={props.title} />,
    })
  } catch {
    return undefined
  }
}

/** 插件入口：注册侧栏注入与 HTML 预览器，随上下文销毁时清理。 */
export function apply(ctx: Context): void {
  pluginContext = ctx
  ctx.effect(() => {
    const dispose = injectSidebar().destroy
    const disposeViewer = registerSidebarViewers(ctx)
    return () => {
      pluginContext = undefined
      disposeViewer?.()
      dispose()
    }
  })
}
