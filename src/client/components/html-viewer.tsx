/**
 * better-sidebar 上的 OpenSpec HTML 预览器：把绝对路径经宿主 raw.url
 * 解析成本插件自己的 /openspec/api/raw/ URL，在沙箱 iframe 中渲染。
 */

import * as React from 'react'
import { call } from '../core/api.ts'

/**
 * openspec 产物的 HTML 预览器组件：把绝对路径经宿主 raw.url 解析成
 * 本插件自己的 /openspec/api/raw/ URL（栅栏是“已注册工作区的
 * openspec/ 目录”，与当前会话 cwd 无关），在沙箱 iframe 中渲染。
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
export function registerSidebarViewers(ctx: { betterSidebar: { registerFileViewer?(descriptor: {
  id: string
  title?: string
  exts: readonly string[]
  priority?: number
  fetchStrategy: string
  component: (props: { path: string; title: string }) => unknown
}): () => void } }): (() => void) | undefined {
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
