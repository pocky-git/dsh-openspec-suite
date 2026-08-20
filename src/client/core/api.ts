/**
 * 调用宿主侧 `/openspec/api/*` 接口的统一封装（JSON 信封）。
 */

/** 调用宿主侧 `/openspec/api/*` 接口的统一封装。 */
export async function call<T>(method: string, payload: Record<string, unknown> = {}, signal?: AbortSignal): Promise<T> {
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
