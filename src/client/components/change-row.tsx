/**
 * 提案行组件：单个 change 卡片（定位会话 + 产物下拉）
 * 与已归档提案的折叠区。
 */

import * as React from 'react'
import type { OpenSpecArtifactFileWire, OpenSpecChangeWire, ProjectWire } from '../core/types.ts'
import { formatBytes, formatMtime } from '../core/format.ts'
import { IconChevronRightOutline12 } from './icons.tsx'

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

interface ChangeRowProps {
  change: OpenSpecChangeWire
  project: ProjectWire
  onOpenFile: (file: OpenSpecArtifactFileWire, change: string) => void
  onLocate: (change: string) => void
}

/** 单个 change 卡片行：定位会话 + 产物下拉；已归档提案保留归档日期。 */
export function ChangeRow(props: ChangeRowProps): React.ReactElement {
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

/** 已归档提案折叠区的 props（不含单个 change，用 changes 数组）。 */
interface ArchivedSectionProps extends Omit<ChangeRowProps, 'change'> {
  changes: OpenSpecChangeWire[]
}

/** 已归档提案的折叠区（默认收起）。 */
export function ArchivedSection(props: ArchivedSectionProps): React.ReactElement {
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
