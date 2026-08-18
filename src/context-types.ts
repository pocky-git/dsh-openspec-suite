/**
 * dsh-openspec-suite 使用方的 Context 类型增强。
 * `import type {} from 'dsh-openspec-suite'` 即可获得这些带类型的服务接缝。
 */
import type { Context } from '@deepseek-ai/cordis'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** 持久的工作区注册表。 */
    workspaceRegistry: import('@deepseek-ai/dsh-session').WorkspaceRegistry
    /** 目录选择能力接缝。 */
    directoryPicker?: import('@deepseek-ai/dsh-host-directory-picker').DirectoryPicker
    /** Web 服务器路由注册表（dsh-host-webserver）。 */
    webServer: import('@deepseek-ai/dsh-host-webserver').WebServer
    /** 设置服务。 */
    settings: import('@deepseek-ai/dsh-settings').SettingsProvider
  }
}

export type { Context }
