import inquirer from 'inquirer';
import chalk from 'chalk';

export interface QAEntry {
    question: string;
    answer: string;
    timestamp: Date;
}

/**
 * Plan Mode UI - Shows Q&A history and handles plan → build transition
 */
export class PlanModeUI {
    private static qaHistory: QAEntry[] = [];

    /**
     * Record a Q&A entry
     */
    static recordQA(question: string, answer: string): void {
        this.qaHistory.push({
            question,
            answer,
            timestamp: new Date()
        });
    }

    /**
     * Show the current Q&A history
     */
    static showQAHistory(): void {
        if (this.qaHistory.length === 0) {
            console.log(chalk.dim('  No questions asked yet.'));
            return;
        }

        console.log('');
        console.log(chalk.cyan('📋 Requirements gathered:'));
        console.log(chalk.gray('─'.repeat(60)));

        for (let i = 0; i < this.qaHistory.length; i++) {
            const entry = this.qaHistory[i];
            console.log(chalk.bold(`${i + 1}. ${entry.question}`));
            console.log(chalk.dim(`   Answer: ${entry.answer}`));
            console.log('');
        }

        console.log(chalk.gray('─'.repeat(60)));
    }

    /**
     * Ask if ready to switch to build mode
     */
    static async askReadyToBuild(): Promise<boolean> {
        console.log('');

        const { ready } = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'ready',
                message: chalk.cyan('🚀 Ready to switch to BUILD mode and implement?'),
                default: true
            }
        ]);

        return ready;
    }

    /**
     * Show plan mode header/summary
     */
    static showPlanHeader(): void {
        console.log('');
        console.log(chalk.cyan.bold('🎯 PLAN MODE'));
        console.log(chalk.dim('   Gathering requirements and planning the solution...'));
        console.log(chalk.dim('   Type your requirements, answer questions, then switch to /build to implement.'));
        console.log('');
    }

    /**
     * Show suggestion to switch to build mode
     */
    static suggestBuildMode(): void {
        console.log('');
        console.log(chalk.yellow('💡 Tip: Type ') + chalk.bold('/build') + chalk.yellow(' to start implementing when ready.'));
    }

    /**
     * Clear Q&A history (e.g., when starting a new session)
     */
    static clearHistory(): void {
        this.qaHistory = [];
    }

    /**
     * Get Q&A history
     */
    static getHistory(): QAEntry[] {
        return [...this.qaHistory];
    }

    /**
     * Show a summary of the plan
     */
    static showPlanSummary(): void {
        if (this.qaHistory.length === 0) {
            return;
        }

        console.log('');
        console.log(chalk.cyan('📝 Plan Summary:'));
        console.log(chalk.gray('─'.repeat(60)));
        console.log(chalk.dim(`Questions answered: ${this.qaHistory.length}`));

        // Show key answers as bullet points
        for (const entry of this.qaHistory) {
            console.log(chalk.dim(`  • ${entry.question}: ${entry.answer}`));
        }

        console.log(chalk.gray('─'.repeat(60)));
    }
}
