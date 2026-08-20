/**
 * 模块级共享状态（头部按钮与总览页共同驱动）：
 * 总览页开关 + 重载令牌的极简发布/订阅 store。
 */

import * as React from 'react'

interface SuiteState {
  /** 递增以让总览页重新加载项目列表。 */
  reloadToken: number
  /** 二级页面当前是否显示。 */
  pageOpen: boolean
}

let suiteState: SuiteState = { reloadToken: 0, pageOpen: false }
const suiteListeners = new Set<() => void>()

/** 更新共享状态并通知所有订阅者。 */
export function setSuiteState(patch: Partial<SuiteState>): void {
  suiteState = { ...suiteState, ...patch }
  for (const listener of suiteListeners) listener()
}

/** 在组件中订阅共享状态。 */
export function useSuiteState(): SuiteState {
  const [state, setState] = React.useState(suiteState)
  React.useEffect(() => {
    const listener = (): void => setState(suiteState)
    suiteListeners.add(listener)
    return () => { suiteListeners.delete(listener) }
  }, [])
  return state
}

/** 订阅共享状态变化（组件外使用，如侧栏注入的 DOM 管理）。 */
export function addSuiteStateListener(listener: () => void): () => void {
  suiteListeners.add(listener)
  return () => { suiteListeners.delete(listener) }
}

/** 移除共享状态监听。 */
export function removeSuiteStateListener(listener: () => void): void {
  suiteListeners.delete(listener)
}

/** 当前共享状态快照（非响应式读取）。 */
export function getSuiteState(): SuiteState {
  return suiteState
}
