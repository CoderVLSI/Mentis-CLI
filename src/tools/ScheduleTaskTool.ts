/**
 * ScheduleTaskTool — lets the agent create scheduled / one-shot tasks.
 *
 * The main LLM calls this when the user asks things like:
 *   "remind me in 2 minutes to take a break"
 *   "every hour summarise the git log"
 *   "check the build status in 30 seconds"
 */

import { Tool } from './Tool'
import { loadTasks, saveTasks, parseInterval, ScheduledTask } from '../scheduler/Scheduler'

export class ScheduleTaskTool implements Tool {
  name        = 'schedule_task'
  description = [
    'Create a scheduled task that runs a prompt automatically.',
    '',
    'Use for:',
    '  - One-shot reminders: "remind me in 2m to take a break" → oneShot: true',
    '  - Recurring tasks: "every 1h summarise git log" → oneShot: false',
    '',
    'interval format: <number><unit>  e.g. "30s", "5m", "2h", "1d"',
  ].join('\n')

  parameters = {
    type: 'object',
    properties: {
      prompt: {
        type:        'string',
        description: 'The prompt to run when the task fires.',
      },
      interval: {
        type:        'string',
        description: 'How long to wait (one-shot) or how often to repeat. Format: 30s, 5m, 2h, 1d.',
      },
      oneShot: {
        type:        'boolean',
        description: 'true = fire once then stop (reminder). false = repeat on the interval (cron).',
      },
    },
    required: ['prompt', 'interval', 'oneShot'],
  }

  async execute(args: { prompt: string; interval: string; oneShot: boolean }): Promise<string> {
    const ms = parseInterval(args.interval)
    if (!ms) return `Error: invalid interval "${args.interval}". Use format: 30s, 5m, 2h, 1d`

    const now  = Date.now()
    const task: ScheduledTask = {
      id:         now.toString(36),
      prompt:     args.prompt,
      interval:   args.interval,
      intervalMs: ms,
      lastRun:    0,
      nextRun:    now + ms,
      enabled:    true,
      createdAt:  now,
      oneShot:    args.oneShot,
    }

    const all = loadTasks()
    all.push(task)
    saveTasks(all)

    const when = new Date(task.nextRun).toLocaleTimeString()
    if (args.oneShot) {
      return `Reminder set for ${when} (in ${args.interval}): "${args.prompt}"`
    }
    return `Recurring task scheduled every ${args.interval}. First run at ${when}. ID: ${task.id}`
  }
}
