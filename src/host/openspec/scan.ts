/**
 * OpenSpec 项目发现：在给定根目录下递归找出所有含
 * `openspec/changes/` 的项目目录。
 */

import { basename, join } from 'node:path'
import { promises as fsp } from 'node:fs'

/** 一个被探测到的 OpenSpec 项目。 */
export interface OpenSpecProject {
  /** 项目根目录（绝对路径）。 */
  path: string
  /** 目录名。 */
  name: string
  /** 根目录本身是否就是 openspec 项目（而非更深层嵌套的）。 */
  root: boolean
}

export const MAX_SCAN_DEPTH = 4

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.venv', 'venv', '__pycache__', 'target', 'openspec'])

/** 判断 `dir` 是否含有带 `changes/` 子目录的 `openspec/` 目录。 */
export async function isOpenspecProject(dir: string): Promise<boolean> {
  try {
    const stat = await fsp.stat(join(dir, 'openspec', 'changes'))
    return stat.isDirectory()
  } catch {
    return false
  }
}

/**
 * 枚举 `rootDir` 下最多 `maxDepth` 层的候选目录。
 * 使用递归 readdir（只返回名字）再对每个候选用 stat() 复核，
 * 因此从不信任 Dirent 的类型字段（在 Electron 宿主里
 * `entry.isDirectory()` 已被证明不可靠）。
 */
async function listSubdirectories(rootDir: string, maxDepth: number, signal?: AbortSignal): Promise<string[]> {
  const results: string[] = []
  const queue: Array<{ dir: string; depth: number }> = [{ dir: rootDir, depth: 0 }]
  while (queue.length > 0) {
    if (signal?.aborted) break
    const { dir, depth } = queue.shift()!
    if (depth >= maxDepth) continue
    let names: string[]
    try {
      names = await fsp.readdir(dir)
    } catch {
      continue
    }
    for (const name of names) {
      if (signal?.aborted) break
      if (SKIP_DIRS.has(name) || name.startsWith('.')) continue
      const child = join(dir, name)
      let stat
      try {
        stat = await fsp.stat(child)
      } catch {
        continue
      }
      if (!stat.isDirectory()) continue
      results.push(child)
      queue.push({ dir: child, depth: depth + 1 })
    }
  }
  return results
}

/**
 * 扫描 `rootDir`（含其自身）最多 `maxDepth` 层，找出所有包含
 * `openspec/changes/` 的目录。
 */
export async function scanOpenspecProjects(rootDir: string, signal?: AbortSignal, maxDepth = MAX_SCAN_DEPTH): Promise<OpenSpecProject[]> {
  const found: OpenSpecProject[] = []
  const rootName = basename(rootDir) || rootDir
  if (await isOpenspecProject(rootDir)) {
    found.push({ path: rootDir, name: rootName, root: true })
  }
  for (const child of await listSubdirectories(rootDir, maxDepth, signal)) {
    if (await isOpenspecProject(child)) {
      found.push({ path: child, name: basename(child), root: child === rootDir })
    }
  }
  return found
}
