import inquirer from 'inquirer';
import chalk from 'chalk';
import { Tool } from './Tool';

/**
 * Question types supported by AskQuestionTool
 */
export type QuestionType = 'text' | 'confirm' | 'list' | 'checkbox';

/**
 * Question definition for the AI to create
 */
interface QuestionDef {
    type: QuestionType;
    question: string;
    options?: Array<{ label: string; description?: string }>;
    default?: any;
}

/**
 * AskQuestionTool - Allows the AI to ask clarifying questions
 * This enables interactive plan mode where AI can gather requirements
 */
export class AskQuestionTool implements Tool {
    name = 'ask_question';
    description = [
        'Ask the user a clarifying question.',
        'STRONGLY prefer arrow-key selection over free-text input — users hate typing.',
        'Use type="confirm" for any yes/no question (arrow keys, one-key answer).',
        'Use type="list" for 2+ discrete choices (arrow keys to select).',
        'Use type="checkbox" for multi-select (space to toggle, enter to confirm).',
        'Only use type="text" when an open-ended written answer is truly required (e.g. a name, a path, a description). NEVER use text for yes/no or choose-from-options.',
    ].join(' ');
    parameters = {
        type: 'object',
        properties: {
            question: {
                type: 'string',
                description: 'The question to ask the user'
            },
            type: {
                type: 'string',
                enum: ['text', 'confirm', 'list', 'checkbox'],
                description: 'Type of question: text (free input), confirm (yes/no), list (single choice), checkbox (multi-select)'
            },
            options: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        label: { type: 'string', description: 'Display text for the option' },
                        description: { type: 'string', description: 'Additional context (optional)' }
                    }
                },
                description: 'Options for list/checkbox questions. Required for list/checkbox types.'
            },
            default: {
                oneOf: [{ type: 'string' }, { type: 'boolean' }, { type: 'array' }],
                description: 'Default value (optional)'
            }
        },
        required: ['question', 'type']
    };

    /**
     * Execute the question and return the user's answer
     */
    async execute(args: QuestionDef & { question: string }): Promise<string> {
        const questionType = args.type || 'text';

        // Show question header
        console.log('');
        console.log(chalk.cyan('🤔 Question from AI:'));
        console.log(chalk.gray('─'.repeat(60)));

        try {
            let result: any;

            switch (questionType) {
                case 'text':
                    result = await this.askText(args.question, args.default);
                    break;

                case 'confirm':
                    result = await this.askConfirm(args.question, args.default);
                    break;

                case 'list':
                    if (!args.options || args.options.length === 0) {
                        return 'Error: list questions require options';
                    }
                    result = await this.askList(args.question, args.options, args.default);
                    break;

                case 'checkbox':
                    if (!args.options || args.options.length === 0) {
                        return 'Error: checkbox questions require options';
                    }
                    result = await this.askCheckbox(args.question, args.options, args.default);
                    break;

                default:
                    return `Error: Unknown question type: ${questionType}`;
            }

            console.log(chalk.gray('─'.repeat(60)));

            // Format result as string for return to LLM
            return this.formatResult(result, questionType);

        } catch (error: any) {
            return `Error asking question: ${error.message}`;
        }
    }

    /**
     * Ask a free-text question
     */
    private async askText(question: string, defaultValue?: string): Promise<string> {
        const { answer } = await inquirer.prompt([
            {
                type: 'input',
                name: 'answer',
                message: question,
                default: defaultValue
            }
        ]);
        return answer;
    }

    /**
     * Ask a yes/no confirmation
     */
    private async askConfirm(question: string, defaultValue?: boolean): Promise<boolean> {
        const { answer } = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'answer',
                message: question,
                default: defaultValue ?? true
            }
        ]);
        return answer;
    }

    /**
     * Ask a single-choice list question
     */
    private async askList(question: string, options: Array<{ label: string; description?: string }>, defaultValue?: string): Promise<string> {
        const { answer } = await inquirer.prompt([
            {
                type: 'list',
                name: 'answer',
                message: question,
                choices: options.map((opt, i) => ({
                    name: opt.label,
                    value: opt.label,
                    short: opt.label
                })),
                default: defaultValue
            }
        ]);
        return answer;
    }

    /**
     * Ask a multi-select checkbox question
     */
    private async askCheckbox(question: string, options: Array<{ label: string; description?: string }>, defaultValue?: string[]): Promise<string[]> {
        const { answer } = await inquirer.prompt([
            {
                type: 'checkbox',
                name: 'answer',
                message: question,
                choices: options.map((opt, i) => ({
                    name: opt.label,
                    value: opt.label,
                    checked: defaultValue?.includes(opt.label),
                    short: opt.label
                }))
            }
        ]);
        return answer;
    }

    /**
     * Format the result for return to the LLM
     */
    private formatResult(result: any, questionType: QuestionType): string {
        switch (questionType) {
            case 'confirm':
                return result === true ? 'Yes' : 'No';

            case 'checkbox':
                if (Array.isArray(result) && result.length > 0) {
                    return `Selected: ${result.join(', ')}`;
                }
                return 'None selected';

            default:
                return String(result);
        }
    }
}
