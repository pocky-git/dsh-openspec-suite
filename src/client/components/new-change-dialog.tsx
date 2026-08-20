/**
 * 创建提案弹窗（输入描述 → 新建会话并自动发送命令）。
 */

import * as React from 'react'
import type { ProjectWire } from '../core/types.ts'

export interface NewChangeDialogState {
  project: ProjectWire
  description: string
  sent: boolean
}

/**
 * 创建提案弹窗：多行描述输入（必填），Enter 提交 / Shift+Enter 换行，
 * 确认后由父组件新建会话并自动发送 /openspec-new-change + 描述。
 */
export function NewChangeDialog(props: {
  dialog: NewChangeDialogState
  busy: boolean
  onChange: (patch: Partial<NewChangeDialogState>) => void
  onClose: () => void
  onSubmit: (description: string) => void
}): React.ReactElement {
  const { dialog, busy } = props
  const inputRef = React.useRef<HTMLTextAreaElement | null>(null)

  React.useEffect(() => { inputRef.current?.focus() }, [dialog.sent])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && !busy) {
      e.preventDefault()
      props.onSubmit(dialog.description)
    }
  }

  const canSubmit = !busy && dialog.description.trim() !== ''

  if (dialog.sent) {
    return (
      <div className="oss-modal-overlay" onClick={props.onClose}>
        <div className="oss-modal oss-modal-success" role="dialog" aria-label="提案创建成功" onClick={(e) => e.stopPropagation()}>
          <div className="oss-modal-success-icon">✓</div>
          <div className="oss-modal-title">提案创建成功</div>
          <div className="oss-muted oss-modal-desc">
            已在「{dialog.project.name}」下新建会话并发送 /openspec-new-change，正在生成提案…
          </div>
          <button className="oss-btn-primary" onClick={props.onClose}>知道了</button>
        </div>
      </div>
    )
  }
  return (
    <div className="oss-modal-overlay" onClick={busy ? undefined : props.onClose}>
      <div className="oss-modal" role="dialog" aria-label="创建提案" onClick={(e) => e.stopPropagation()}>
        <div className="oss-modal-title">创建提案</div>
        <div className="oss-muted oss-modal-desc">
          将在「{dialog.project.name}」下新建会话，自动发送 /openspec-new-change 与你的描述。
        </div>
        <textarea
          ref={inputRef}
          className="oss-modal-textarea"
          rows={4}
          value={dialog.description}
          placeholder="提案描述（必填）"
          disabled={busy}
          onChange={(e) => props.onChange({ description: e.target.value })}
          onKeyDown={handleKeyDown}
        />
        <div className="oss-row oss-modal-actions">
          <div className="oss-grow" />
          <button className="oss-btn" disabled={busy} onClick={props.onClose}>取消</button>
          <button className="oss-btn-primary" disabled={!canSubmit} onClick={() => props.onSubmit(dialog.description)}>
            {busy ? '创建中…' : '创建'}
          </button>
        </div>
      </div>
    </div>
  )
}
