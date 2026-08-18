/**
 * Context augmentation for dsh-openspec-suite consumers.
 * `import type {} from 'dsh-openspec-suite'` gains the typed service seams.
 */
import type { Context } from '@deepseek-ai/cordis'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Durable workspace registry. */
    workspaceRegistry: import('@deepseek-ai/dsh-session').WorkspaceRegistry
    /** Directory picking capability seam. */
    directoryPicker?: import('@deepseek-ai/dsh-host-directory-picker').DirectoryPicker
    /** Web server route registry (dsh-host-webserver). */
    webServer: import('@deepseek-ai/dsh-host-webserver').WebServer
    /** Settings service. */
    settings: import('@deepseek-ai/dsh-settings').SettingsProvider
  }
}

export type { Context }
