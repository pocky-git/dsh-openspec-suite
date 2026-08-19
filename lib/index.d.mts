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
    /** Agent 注册表（dsh-agent，由 dsh-base 挂载）。 */
    agents?: import('@deepseek-ai/dsh-agent').AgentRegistry;
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
/**
 * 提案生命周期状态：
 * - designing 方案设计中（schema 产物尚有缺口）
 * - ready     待实施（产物齐全、任务未开工）
 * - applying  实施中（任务有勾选进度但未完成）
 * - done      待归档（任务全部完成、尚未归档）
 * - archived  已归档
 */
type ChangeStatus = 'designing' | 'ready' | 'applying' | 'done' | 'archived';
/** 一个变更提案及其产物/任务进度。 */
interface OpenSpecChange {
  name: string;
  /** 生命周期状态。 */
  status: ChangeStatus;
  /** tasks.md 中已勾选 / 总复选框数（文件缺失时为 0/0）。 */
  tasks: {
    done: number;
    total: number;
  };
  /** 产物文件清单（仅 schema.yaml 定义且已生成的产物），按 schema 顺序排列。 */
  files: OpenSpecArtifactFile[];
  /** 本项目 schema.yaml 定义的期望产物，用于展示"缺失产物"。 */
  expected: OpenSpecExpectedArtifact[];
  /** 归档时间（ISO 日期，从归档目录名 YYYY-MM-DD-<name> 解析；仅已归档）。 */
  archivedAt?: string;
}
/** schema.yaml 中定义的一个产物阶段。 */
interface OpenSpecExpectedArtifact {
  /** schema 里的 artifact id（如 brainstorm / proposal / test-cases）。 */
  id: string;
  /** 该产物在该 change 目录下是否已存在（按 generates glob 匹配）。 */
  satisfied: boolean;
}
/** change 目录下的一个可预览产物文件。 */
interface OpenSpecArtifactFile {
  /** 产物类别：schema 产物 id。 */
  kind: string;
  /** 展示名：proposal.md / design.html / specs/<capability>/spec.md。 */
  label: string;
  /** 绝对路径（用于 file.read 预览）。 */
  path: string;
  /** 字节大小。 */
  bytes: number;
  /** 最后修改时间（ISO 字符串）。 */
  mtime: string;
}
/** 汇总一个 openspec 项目的所有 change（活跃 + 已归档）。 */
declare function readProjectChanges(projectDir: string, signal?: AbortSignal): Promise<OpenSpecChange[]>;
interface Config {
  scanDepth?: number;
}
declare const Config: z<Config>;
declare function apply(ctx: Context, config: Config): void;
//#endregion
export { ChangeStatus, Config, OpenSpecArtifactFile, OpenSpecChange, OpenSpecExpectedArtifact, OpenSpecProject, apply, inject, name, readProjectChanges, scanOpenspecProjects };