import chalk from 'chalk';
import ora, { Ora } from 'ora';

export interface ToolExecution {
    toolName: string;
    args: Record<string, any>;
    status: 'running' | 'completed' | 'failed';
    result?: string;
    error?: string;
}

/**
 * Visual feedback for tool execution
 * Shows colored icons, spinners, and grouped display
 */
export class ToolExecutor {
    private static executions: ToolExecution[] = [];
    private static spinners: Map<string, Ora> = new Map();

    /**
     * Get colored text for a tool name
     */
    private static colorToolName(toolName: string, color: string): string {
        switch (color) {
            case 'blue': return chalk.blue(toolName);
            case 'yellow': return chalk.yellow(toolName);
            case 'cyan': return chalk.cyan(toolName);
            case 'magenta': return chalk.magenta(toolName);
            case 'green': return chalk.green(toolName);
            case 'red': return chalk.red(toolName);
            case 'gray': return chalk.gray(toolName);
            default: return toolName;
        }
    }

    /**
     * Start a tool execution with visual feedback
     */
    static startExecution(toolName: string, args: Record<string, any>): void {
        const execution: ToolExecution = {
            toolName,
            args,
            status: 'running'
        };

        this.executions.push(execution);

        // Get icon and color for tool type
        const { icon, color } = this.getToolStyle(toolName);

        // Format args for display (truncate long values)
        const argsDisplay = this.formatArgs(args);

        // Start spinner
        const spinner = ora({
            text: `${icon} ${this.colorToolName(toolName, color)} ${argsDisplay}`,
            color: color as 'cyan' | 'yellow' | 'red' | 'green' | 'blue' | 'magenta' | 'white' | 'gray'
        });
        spinner.start();

        this.spinners.set(toolName, spinner);
    }

    /**
     * Complete a tool execution successfully
     */
    static completeExecution(toolName: string, result: string): void {
        const execution = this.executions.find(e => e.toolName === toolName);
        if (execution) {
            execution.status = 'completed';
            execution.result = result;
        }

        const spinner = this.spinners.get(toolName);
        if (spinner) {
            const { icon } = this.getToolStyle(toolName);
            spinner.succeed(`${icon} ${chalk.green(toolName)} completed`);
            this.spinners.delete(toolName);
        }
    }

    /**
     * Mark a tool execution as failed
     */
    static failExecution(toolName: string, error: string): void {
        const execution = this.executions.find(e => e.toolName === toolName);
        if (execution) {
            execution.status = 'failed';
            execution.error = error;
        }

        const spinner = this.spinners.get(toolName);
        if (spinner) {
            const { icon } = this.getToolStyle(toolName);
            spinner.fail(`${icon} ${chalk.red(toolName)} failed: ${error}`);
            this.spinners.delete(toolName);
        }
    }

    /**
     * Show grouped summary of all tool executions
     */
    static showSummary(): void {
        if (this.executions.length === 0) {
            return;
        }

        console.log('');
        console.log(chalk.gray('─'.repeat(60)));
        console.log(chalk.cyan('🔧 Tool Executions'));
        console.log(chalk.gray('─'.repeat(60)));

        for (const execution of this.executions) {
            const { icon, color } = this.getToolStyle(execution.toolName);
            const statusIcon = execution.status === 'completed' ? '✓' : execution.status === 'failed' ? '✗' : '…';

            console.log(
                `${icon} ${this.colorToolName(execution.toolName, color)} ${chalk.dim(statusIcon)}`
            );
        }

        console.log(chalk.gray('─'.repeat(60)));
        console.log('');

        // Reset for next batch
        this.executions = [];
    }

    /**
     * Get visual style for a tool type
     */
    private static getToolStyle(toolName: string): { icon: string; color: string } {
        const styles: Record<string, { icon: string; color: string }> = {
            'read_file': { icon: '📖', color: 'blue' },
            'write_file': { icon: '📄', color: 'yellow' },
            'edit_file': { icon: '✏️', color: 'yellow' },
            'list_dir': { icon: '📁', color: 'cyan' },
            'search_files': { icon: '🔍', color: 'magenta' },
            'search_web': { icon: '🌐', color: 'blue' },
            'run_command': { icon: '💻', color: 'green' },
            'git_commit': { icon: '📝', color: 'green' }
        };

        return styles[toolName] || { icon: '🔧', color: 'gray' };
    }

    /**
     * Format arguments for display
     */
    private static formatArgs(args: Record<string, any>): string {
        const parts: string[] = [];

        for (const [key, value] of Object.entries(args)) {
            const strValue = String(value);
            // Truncate long values
            const display = strValue.length > 30 ? strValue.slice(0, 30) + '...' : strValue;
            parts.push(`${key}=${chalk.dim(display)}`);
        }

        return parts.length > 0 ? chalk.dim(`(${parts.join(', ')})`) : '';
    }

    /**
     * Show a simple inline tool usage message
     */
    static showInline(toolName: string, args: Record<string, any>): void {
        const { icon, color } = this.getToolStyle(toolName);
        const argsDisplay = this.formatArgs(args);
        console.log(chalk.dim(`  ${icon} ${this.colorToolName(toolName, color)} ${argsDisplay}`));
    }

    /**
     * Clear all pending executions
     */
    static clear(): void {
        for (const spinner of this.spinners.values()) {
            spinner.stop();
        }
        this.spinners.clear();
        this.executions = [];
    }
}
