import z from "schemastery";
import { Context } from "@deepseek-ai/cordis";
//#region src/context-types.d.ts
declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Durable workspace registry. */
    workspaceRegistry: import('@deepseek-ai/dsh-session').WorkspaceRegistry;
    /** Directory picking capability seam. */
    directoryPicker?: import('@deepseek-ai/dsh-host-directory-picker').DirectoryPicker;
    /** Web server route registry (dsh-host-webserver). */
    webServer: import('@deepseek-ai/dsh-host-webserver').WebServer;
    /** Settings service. */
    settings: import('@deepseek-ai/dsh-settings').SettingsProvider;
  }
}
//#endregion
//#region src/index.d.ts
/** Plugin identity for cordis.yml rows. */
declare const name = "dsh-openspec-suite";
/** Services required before mounting. */
declare const inject: string[];
/** One detected OpenSpec project. */
interface OpenSpecProject {
  /** Project root (absolute path). */
  path: string;
  /** Directory basename. */
  name: string;
  /** Whether the root itself is the openspec project (vs nested deeper). */
  root: boolean;
}
/**
 * Scan `rootDir` (itself included) up to `maxDepth` levels for directories
 * containing `openspec/changes/`.
 */
declare function scanOpenspecProjects(rootDir: string, signal?: AbortSignal, maxDepth?: number): Promise<OpenSpecProject[]>;
/** One change proposal with its artifact/task progress. */
interface OpenSpecChange {
  name: string;
  /** Artifacts present: proposal / design / specs / tasks. */
  artifacts: {
    proposal: boolean;
    design: boolean;
    specs: boolean;
    tasks: boolean;
  };
  /** Checked / total checkboxes in tasks.md (0/0 when absent). */
  tasks: {
    done: number;
    total: number;
  };
}
/** Summarize every active (non-archived) change of one openspec project. */
declare function readProjectChanges(projectDir: string, signal?: AbortSignal): Promise<OpenSpecChange[]>;
interface Config {
  scanDepth?: number;
}
declare const Config: z<Config>;
declare function apply(ctx: Context, config: Config): void;
//#endregion
export { Config, OpenSpecChange, OpenSpecProject, apply, inject, name, readProjectChanges, scanOpenspecProjects };