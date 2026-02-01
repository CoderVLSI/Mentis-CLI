import inquirer from 'inquirer';
import chalk from 'chalk';
import { Tool } from './Tool';
import { PlanModeUI } from '../ui/PlanModeUI';

/**
 * PlanModeTool - Allows AI to suggest switching to plan mode
 * Use this when the task is complex, requires architecture design, or needs requirements gathering
 */
export class PlanModeTool implements Tool {
    name = 'enter_plan_mode';
    description = 'Suggest switching to plan mode for complex tasks. Call this when you need to gather requirements, design architecture, or break down a complex implementation before coding.';
    parameters = {
        type: 'object',
        properties: {
            reason: {
                type: 'string',
                description: 'Explain why plan mode is recommended for this task'
            }
        },
        required: ['reason']
    };

    /**
     * Execute - Ask user if they want to switch to plan mode
     */
    async execute(args: { reason: string }): Promise<string> {
        console.log('');
        console.log(chalk.cyan('🎯 AI suggests entering PLAN MODE'));
        console.log(chalk.gray('─'.repeat(60)));
        console.log(chalk.dim(`Reason: ${args.reason}`));
        console.log(chalk.gray('─'.repeat(60)));

        const { confirm } = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'confirm',
                message: 'Switch to plan mode?',
                default: true
            }
        ]);

        if (confirm) {
            PlanModeUI.showPlanHeader();
            return 'User approved. Switching to plan mode for requirements gathering and planning.';
        }

        return 'User declined. Continuing in current mode.';
    }
}
