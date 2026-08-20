/**
 * OpenSpec 总览页（渲染在侧栏浮层内的二级页面）：
 * 已导入项目的只读列表 + 创建提案 + 导入流程 + 产物预览。
 */

import * as React from 'react'
import { call } from '../core/api.ts'
import type { ImportAllResult, OpenSpecArtifactFileWire, PickerState, ProjectWire } from '../core/types.ts'
import { setSuiteState, useSuiteState } from '../core/suite-state.ts'
import { findChangeSession } from '../core/change-session.ts'
import { openInBetterSidebar, openSession, prefillDraft, startWorkspaceSession, submitDraft, waitForNewSession } from '../core/services.ts'
import { DirPicker, initialPickerState, startDirectoryPick } from './dir-picker.tsx'
import { ChangeRow, ArchivedSection } from './change-row.tsx'
import { NewChangeDialog, type NewChangeDialogState } from './new-change-dialog.tsx'
import { FilePreview, type FilePreviewState } from './file-preview.tsx'
import { IconChevronLeftOutline14, IconRefreshOutline14 } from './icons.tsx'

/** 打开产物：优先 better-sidebar 编辑器，回退应用内预览。 */
function openArtifact(
  file: OpenSpecArtifactFileWire,
  changeName: string,
  projectPath: string,
  setPreview: (state: FilePreviewState) => void,
): void {
  // 优先打开到 dsh-better-sidebar 编辑器（HTML 由本插件注册的高优先级
  // 预览器接管，走自己的 raw 路由，不受会话 cwd 栅栏限制）；不可用时
  // 回退应用内预览。
  if (openInBetterSidebar(file.path, `${changeName}/${file.label}`)) return
  setPreview({ change: changeName, file, projectPath })
}

/** 总览页（渲染在侧栏浮层内）。 */
export function OverviewPage(props: { onBack: () => void }): React.ReactElement {
  const suite = useSuiteState()
  const [projects, setProjects] = React.useState<ProjectWire[] | null>(null)
  const [error, setError] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [refreshing, setRefreshing] = React.useState(false)

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

  /** 创建提案：为该项目新建 agent 会话，预填并发送 /openspec-new-change + 描述。 */
  const runNewChange = async (project: ProjectWire, description: string): Promise<void> => {
    // 描述必填：弹窗按钮已禁用，这里兜底拦截（如 Enter 直达）。
    if (description.trim() === '') {
      setError('提案描述不能为空')
      return
    }
    setBusy(true); setError('')
    try {
      const before = new Set(project.sessionIds)
      startWorkspaceSession(project.workspaceId)
      // 新会话经 wire 建立需要一点时间；轮询至多约 2 秒等 current
      // 变成该项目下的一个新会话后再预填草稿。
      const newSessionId = await waitForNewSession(before)
      const line = description.trim() === '' ? '/openspec-new-change' : `/openspec-new-change ${description.trim()}`
      if (!prefillDraft(line)) {
        setError('已新建会话，但未能发送命令（可手动输入 /openspec-new-change）')
        setNewChangeDialog(null)
        return
      }
      if (!submitDraft()) {
        setError('草稿已填入但自动发送失败，请在会话中手动发送')
        setNewChangeDialog(null)
        return
      }
      // 记录提案 → 会话待绑定：宿主记下点击时刻，之后对账时把
      // birthtime 晚于该时刻的新提案目录绑给这个会话（写入提案目录
      // 内 .dsh-session 标记）。
      if (newSessionId !== undefined) {
        await call('changeSession.bind', {
          projectPath: project.path,
          sessionId: newSessionId,
        }).catch(() => undefined)
      }
      setNewChangeDialog({ project, description, sent: true })
      setSuiteState({ pageOpen: false })
    } finally {
      setBusy(false)
    }
  }

  // ── ＋ 导入流程（选文件夹 → 扫描并导入其下所有项目） ──

  const [picker, setPicker] = React.useState<PickerState>(initialPickerState)
  const [preview, setPreview] = React.useState<FilePreviewState | null>(null)

  // ── 创建提案弹窗（输入描述 → 新建会话并自动发送） ──
  const [newChangeDialog, setNewChangeDialog] = React.useState<NewChangeDialogState | null>(null)

  const importAllUnder = async (dir: string): Promise<void> => {
    setBusy(true); setError('')
    try {
      const result = await call<ImportAllResult>('scanAndImportAll', { path: dir })
      setSuiteState({ reloadToken: suite.reloadToken + 1 })
      setPicker((p) => ({ ...p, open: false }))
      if (result.count === 0) setError('所选文件夹内没有发现 OpenSpec 项目（需包含 openspec/changes 目录）')
    } catch (err) { setError(String((err as Error).message ?? err)) }
    finally { setBusy(false) }
  }

  const startImport = async (): Promise<void> => {
    await startDirectoryPick(setPicker, setError, importAllUnder)
  }

  return (
    <div className="oss-page">
      <div className="oss-page-header">
        <button className="oss-back-btn" type="button" title="返回工作区" aria-label="返回工作区" onClick={props.onBack}>
          <IconChevronLeftOutline14 size={18} />
        </button>
        <span className="oss-page-title">OpenSpec 项目总览</span>
        <div className="oss-grow" />
        <button
          className="oss-back-btn"
          type="button"
          title="刷新数据"
          aria-label="刷新数据"
          disabled={busy}
          onClick={() => { setRefreshing(true); reload(); window.setTimeout(() => setRefreshing(false), 400) }}
        >
          <IconRefreshOutline14 size={14} spinning={refreshing} />
        </button>
        <button className="oss-back-btn" type="button" title="选择文件夹导入" aria-label="选择文件夹导入" disabled={busy} onClick={() => void startImport()}>
          <span className="oss-plus-icon">＋</span>
        </button>
      </div>
      <div className="oss-page-body">
        {picker.error !== '' && <div className="oss-err">{picker.error}</div>}
        <DirPicker state={picker} busy={busy} onState={setPicker} onConfirm={(dir) => void importAllUnder(dir)} />
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
                      title="输入描述后自动新建会话并创建提案"
                      onClick={() => setNewChangeDialog({ project, description: '', sent: false })}
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
                      onOpenFile={(file, changeName) => openArtifact(file, changeName, project.path, setPreview)}
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
                    openArtifact(file, changeName, project.path, setPreview)
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
      {newChangeDialog !== null && (
        <NewChangeDialog
          dialog={newChangeDialog}
          busy={busy}
          onChange={(next) => setNewChangeDialog((d) => d === null ? d : { ...d, ...next })}
          onClose={() => setNewChangeDialog(null)}
          onSubmit={(description) => { void runNewChange(newChangeDialog.project, description) }}
        />
      )}
    </div>
  )
}
