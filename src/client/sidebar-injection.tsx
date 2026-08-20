/**
 * 侧栏注入：入口按钮 + 二级页面浮层。
 * 通过 MutationObserver 定位侧栏工作区头部，在其后注入入口按钮；
 * 总览页浮层渲染到工作区浏览器根节点（独立 React root）。
 */

import * as ReactDOMClient from 'react-dom/client'
import { OverviewPage } from './components/overview-page.tsx'
import { addSuiteStateListener, getSuiteState, removeSuiteStateListener, setSuiteState } from './core/suite-state.ts'
import { ICON_LIST_PEN_PATHS } from './components/icons.tsx'

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
export function injectSidebar(): SidebarInjection {
  let buttonHost: HTMLDivElement | null = null
  let pageHost: HTMLDivElement | null = null
  let reactRoot: ReactDOMClient.Root | null = null
  let observer: MutationObserver | null = null
  let disposed = false

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

  /** 根据共享状态渲染（或拆除）页面浮层。 */
  const syncPage = (): void => {
    if (disposed) return
    const open = getSuiteState().pageOpen
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

  const mount = (): void => {
    if (disposed) return
    // 锚定在侧栏根容器里：“新建会话”按钮之后、工作区区域（regionArea）之前。
    const newSession = findNewSessionButton()
    if (newSession === null) return
    const sidebarRoot = newSession.parentElement
    if (sidebarRoot === null) return

    // 宽/窄（rail）模式判定：直接以侧栏根容器的渲染宽度为准。
    // 展开约 280px；收起（rail）后收缩为图标列（远小于 120px）。
    const prevWidth = sidebarWidthRef
    const sidebarWidth = sidebarRoot.getBoundingClientRect().width
    sidebarWidthRef = sidebarWidth
    const wide = sidebarWidth > 120

    // 侧栏收起（宽 → rail）时自动关闭总览页：浮层依附于展开态的侧栏
    // DOM，收起后没有可用的展示空间。以“上一帧还是宽模式”为条件，
    // 避免“收起态点击入口 → 先展开再打开”流程中被展开动画初期的
    // 窄宽度误关闭。
    if (!wide && prevWidth > 120 && getSuiteState().pageOpen) {
      setSuiteState({ pageOpen: false })
    }

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
    if (getSuiteState().pageOpen && pageHost !== null && pageHost.parentElement !== root) root.appendChild(pageHost)
    syncPage()
  }

  const stateListener = (): void => { syncPage() }
  addSuiteStateListener(stateListener)

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
      removeSuiteStateListener(stateListener)
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
