/**
 * 应用内目录浏览器（降级方案）：宿主不支持原生文件夹选择时，
 * 通过 dir.list 逐级浏览并选定导入根目录。
 */

import * as React from 'react'
import { call } from '../core/api.ts'
import type { PickerState } from '../core/types.ts'
import { parentOf } from '../core/format.ts'

interface DirPickerProps {
  state: PickerState
  busy: boolean
  onState: (next: PickerState) => void
  onConfirm: (dir: string) => void
}

/** 目录浏览器卡片：上级导航 + 子目录列表 + 导入确认。 */
export function DirPicker(props: DirPickerProps): React.ReactElement | null {
  const { state: picker, busy } = props
  if (!picker.open) return null
  return (
    <div className="oss-card oss-picker">
      <div className="oss-row">
        <button className="oss-btn" onClick={() => void browseTo(props, parentOf(picker.path))}>↑ 上级</button>
        <span className="oss-muted">{picker.path || '~'}</span>
      </div>
      {picker.entries.length === 0 && <div className="oss-muted">（无子目录）</div>}
      {picker.entries
        .filter((entry) => !entry.name.startsWith('.'))
        .map((entry) => (
          <div key={entry.path} className="oss-dir-entry" onClick={() => void browseTo(props, entry.path)}>
            📁 {entry.name}
          </div>
        ))}
      <div className="oss-row oss-picker-actions">
        <button className="oss-btn-primary" disabled={busy} onClick={() => props.onConfirm(picker.path)}>
          {busy ? '导入中…' : '导入此目录下所有项目'}
        </button>
        <button className="oss-btn" onClick={() => props.onState({ ...picker, open: false })}>取消</button>
      </div>
    </div>
  )
}

/** 浏览到某个目录并更新选择器状态。 */
async function browseTo(props: DirPickerProps, dir: string): Promise<void> {
  try {
    const listing = await call<{ path: string; entries: Array<{ name: string; path: string }> }>('dir.list', { path: dir })
    props.onState({ open: true, path: listing.path, entries: listing.entries, error: '' })
  } catch (err) {
    props.onState({ ...props.state, error: String((err as Error).message ?? err) })
  }
}

/** 打开选择器：先尝试原生拾取，失败降级为应用内浏览。 */
export async function startDirectoryPick(
  setState: (next: PickerState) => void,
  onError: (message: string) => void,
  onPicked: (dir: string) => Promise<void>,
): Promise<void> {
  try {
    const picked = await call<{ path: string | null }>('pick', {})
    if (picked.path !== null && picked.path !== '') await onPicked(picked.path)
  } catch (err) {
    const code = (err as { code?: string }).code
    if (code === 'picker-unavailable' || code === 'pick-unsupported') {
      // 仅支持浏览的宿主：打开应用内目录浏览器降级方案
      setState({ open: true, path: '', entries: [], error: '' })
      try {
        const listing = await call<{ path: string; entries: Array<{ name: string; path: string }> }>('dir.list', {})
        setState({ open: true, path: listing.path, entries: listing.entries, error: '' })
      } catch { setState({ open: false, path: '', entries: [], error: '目录选择不可用' }) }
      return
    }
    onError(String((err as Error).message ?? err))
  }
}

/** 首次打开时加载根目录列表（供 OverviewPage 挂载调用）。 */
export function initialPickerState(): PickerState {
  return { open: false, path: '', entries: [], error: '' }
}
