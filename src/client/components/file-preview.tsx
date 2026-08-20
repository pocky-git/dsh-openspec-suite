/**
 * Markdown 预览（三级浮层，覆盖在总览页内部）：
 * 极简安全渲染 + 沙箱 iframe（交互式 HTML 产物）。
 */

import * as React from 'react'
import { call } from '../core/api.ts'
import type { OpenSpecArtifactFileWire } from '../core/types.ts'
import { formatBytes, formatMtime } from '../core/format.ts'
import { IconChevronLeftOutline14 } from './icons.tsx'

export interface FilePreviewState {
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

/** 产物文件预览：Markdown 安全渲染 / HTML 沙箱 iframe。 */
export function FilePreview(props: { state: FilePreviewState; onBack: () => void }): React.ReactElement {
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
