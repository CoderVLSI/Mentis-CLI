/**
 * Scheduler — run agent prompts on a recurring schedule.
 *
 * Tasks are stored in ~/.mentis/schedules.json.
 * The scheduler runs in the background within the CLI process and fires
 * tasks whose nextRun time has passed.
 *
 * Supported intervals: Xs, Xm, Xh, Xd  (seconds/minutes/hours/days)
 */

import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

const SCHEDULES_PATH = path.join(os.homedir(), '.mentis', 'schedules.json')

export interface ScheduledTask {
  id:           string
  prompt:       string
  interval:     string   // e.g. "30m", "1h", "1d"
  intervalMs:   number
  lastRun:      number   // epoch ms, 0 = never
  nextRun:      number   // epoch ms
  enabled:      boolean
  createdAt:    number
}

export function parseInterval(s: string): number | null {
  const m = s.trim().match(/^(\d+(?:\.\d+)?)(s|m|h|d)$/)
  if (!m) return null
  const n = parseFloat(m[1])
  const unit: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }
  return Math.round(n * unit[m[2]])
}

export function loadTasks(): ScheduledTask[] {
  try { return JSON.parse(fs.readFileSync(SCHEDULES_PATH, 'utf-8')) } catch { return [] }
}

export function saveTasks(tasks: ScheduledTask[]): void {
  const dir = path.dirname(SCHEDULES_PATH)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(SCHEDULES_PATH, JSON.stringify(tasks, null, 2))
}

export class Scheduler {
  private timer: ReturnType<typeof setInterval> | null = null
  private onFire: (task: ScheduledTask) => Promise<void>

  constructor(onFire: (task: ScheduledTask) => Promise<void>) {
    this.onFire = onFire
  }

  start(pollMs = 10_000) {
    if (this.timer) return
    this.timer = setInterval(() => this.tick(), pollMs)
  }

  stop() {
    if (this.timer) { clearInterval(this.timer); this.timer = null }
  }

  private async tick() {
    const now   = Date.now()
    const tasks = loadTasks()
    let changed = false

    for (const task of tasks) {
      if (!task.enabled || task.nextRun > now) continue
      task.lastRun = now
      task.nextRun = now + task.intervalMs
      changed = true
      try { await this.onFire(task) } catch {}
    }

    if (changed) saveTasks(tasks)
  }

  isRunning() { return !!this.timer }
}
