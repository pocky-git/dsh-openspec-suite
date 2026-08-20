/**
 * 提案 → 会话绑定（标记文件方案）。
 *
 * 绑定权威存储 = 提案目录内的 .dsh-session 隐藏文件（内容为会话
 * id）。随提案目录走（归档移动也带着），不依赖宿主设置持久化。
 *
 * 写入时机：点“创建提案”→ 新会话就绪后记录待绑定 (项目路径 →
 * {会话 id, 点击时刻})。此后任何一次 overview 扫描 / 定位查询，
 * 都会做惰性对账：该项目下 birthtime 晚于点击时刻、且尚无标记
 * 文件的提案目录 = 那次创建的产物，直接写入标记文件。
 * （/openspec-new-change 命令只是预填草稿，提案目录要等 agent
 * 执行后才出现，所以绑定必然是延迟完成的。）
 *
 * 定位优先级：标记文件 → 第一条会话兜底。标记指向的会话不在
 * 项目会话列表里时视为失效，忽略标记。
 */

import { join } from 'node:path'
import { promises as fsp } from 'node:fs'
import type { OpenSpecChange } from './changes.ts'

/** 提案目录内绑定标记文件的文件名。 */
const MARKER_FILENAME = '.dsh-session'

interface PendingBinding {
  sessionId: string
  since: number
}

/** 管理待绑定记录与标记文件的读写对账。 */
export class ChangeSessionBindings {
  private readonly pending = new Map<string, PendingBinding>()

  /** 读取提案目录的绑定标记；不存在/不可读返回 undefined。 */
  async readMarker(changeDir: string): Promise<string | undefined> {
    try {
      const content = await fsp.readFile(join(changeDir, MARKER_FILENAME), 'utf8')
      const trimmed = content.trim()
      return trimmed === '' ? undefined : trimmed
    } catch {
      return undefined
    }
  }

  /** 把绑定标记写入提案目录（原子写，失败静默——下次对账重试）。 */
  async writeMarker(changeDir: string, sessionId: string): Promise<void> {
    try {
      await fsp.writeFile(join(changeDir, MARKER_FILENAME), `${sessionId}\n`, 'utf8')
    } catch { /* 目录可能已被归档/删除 */ }
  }

  /** 记录一次“点击创建提案 → 新建会话”的待绑定。 */
  bindLater(projectPath: string, sessionId: string): void {
    this.pending.set(projectPath, { sessionId, since: Date.now() })
  }

  /**
   * 惰性对账：为 pending 里每个项目，把“点击时刻之后新建且尚无
   * 标记”的提案目录绑给点击时创建的会话。birthtime（目录创建
   * 时间）晚于点击时刻 = 那次创建的产物，毫秒级精确，不受提案名
   * 启发式影响。只绑定一个（最新的那个）——一次点击只创建一个
   * 提案；绑到了才清待绑定，目录还没出现就保留到下次。
   */
  async reconcile(projects: Array<{ path: string; changes: OpenSpecChange[] }>): Promise<void> {
    for (const [projectPath, pending] of this.pending) {
      const project = projects.find((p) => p.path === projectPath)
      if (project === undefined) continue
      // 候选：birthtime 晚于点击时刻的活跃提案目录（归档的不算，
      // 点击时还没归档的历史提案 birthtime 必然早于点击时刻）。
      const candidates: Array<{ name: string; bornAt: number }> = []
      for (const change of project.changes) {
        if (change.status === 'archived') continue
        try {
          const stat = await fsp.stat(join(projectPath, 'openspec', 'changes', change.name))
          if (!stat.isDirectory()) continue
          if (stat.birthtimeMs > pending.since) candidates.push({ name: change.name, bornAt: stat.birthtimeMs })
        } catch { /* 目录消失，跳过 */ }
      }
      if (candidates.length === 0) continue
      // 最新出生的目录 = 这次点击的产物（同一次 agent 回合只建一个）。
      candidates.sort((a, b) => b.bornAt - a.bornAt)
      const target = candidates[0]!
      await this.writeMarker(join(projectPath, 'openspec', 'changes', target.name), pending.sessionId)
      this.pending.delete(projectPath)
    }
  }
}
