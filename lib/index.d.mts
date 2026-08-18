import z from "schemastery";
import { Context } from "@deepseek-ai/cordis";
//#region src/context-types.d.ts
declare module '@deepseek-ai/cordis' {
  interface Context {
    /** 持久的工作区注册表。 */
    workspaceRegistry: import('@deepseek-ai/dsh-session').WorkspaceRegistry;
    /** 目录选择能力接缝。 */
    directoryPicker?: import('@deepseek-ai/dsh-host-directory-picker').DirectoryPicker;
    /** Web 服务器路由注册表（dsh-host-webserver）。 */
    webServer: import('@deepseek-ai/dsh-host-webserver').WebServer;
    /** 设置服务。 */
    settings: import('@deepseek-ai/dsh-settings').SettingsProvider;
  }
}
//#endregion
//#region src/index.d.ts
/** 插件标识，用于 cordis.yml 的行。 */
declare const name = "dsh-openspec-suite";
/** 挂载前需要的服务。 */
declare const inject: string[];
/** 一个被探测到的 OpenSpec 项目。 */
interface OpenSpecProject {
  /** 项目根目录（绝对路径）。 */
  path: string;
  /** 目录名。 */
  name: string;
  /** 根目录本身是否就是 openspec 项目（而非更深层嵌套的）。 */
  root: boolean;
}
/**
 * 扫描 `rootDir`（含其自身）最多 `maxDepth` 层，找出所有包含
 * `openspec/changes/` 的目录。
 */
declare function scanOpenspecProjects(rootDir: string, signal?: AbortSignal, maxDepth?: number): Promise<OpenSpecProject[]>;
/** 一个变更提案及其产物/任务进度。 */
interface OpenSpecChange {
  name: string;
  /** 已存在的产物：proposal / design / specs / tasks。 */
  artifacts: {
    proposal: boolean;
    design: boolean;
    specs: boolean;
    tasks: boolean;
  };
  /** tasks.md 中已勾选 / 总复选框数（文件缺失时为 0/0）。 */
  tasks: {
    done: number;
    total: number;
  };
}
/** 汇总一个 openspec 项目的所有活跃（未归档）change。 */
declare function readProjectChanges(projectDir: string, signal?: AbortSignal): Promise<OpenSpecChange[]>;
interface Config {
  scanDepth?: number;
}
declare const Config: z<Config>;
declare function apply(ctx: Context, config: Config): void;
//#endregion
export { Config, OpenSpecChange, OpenSpecProject, apply, inject, name, readProjectChanges, scanOpenspecProjects };