/**
 * 通用展示工具：字节/时间格式化、路径计算。
 */

/** 字节数的紧凑展示。 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`
}

/** mtime 的本地紧凑展示。 */
export function formatMtime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** 取路径的父目录（以 / 分隔）。 */
export function parentOf(path: string): string {
  const normalized = path.replace(/\/+$/u, '')
  if (normalized === '' || normalized === '/') return '/'
  const cut = normalized.lastIndexOf('/')
  return cut <= 0 ? '/' : normalized.slice(0, cut)
}
