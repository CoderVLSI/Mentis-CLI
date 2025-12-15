import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { ConfigManager } from '../config/ConfigManager';
import { ModelClient, ChatMessage } from '../llm/ModelInterface';
import { OpenAIClient } from '../llm/OpenAIClient';
import { ContextManager } from '../context/ContextManager';
import { UIManager } from '../ui/UIManager';
import { WriteFileTool, ReadFileTool, ListDirTool } from '../tools/FileTools';
import { SearchFileTool } from '../tools/SearchTools';
import { PersistentShellTool } from '../tools/PersistentShellTool';
import { PersistentShell } from './PersistentShell';
import { WebSearchTool } from '../tools/WebSearchTool';
import { GitStatusTool, GitDiffTool, GitCommitTool, GitPushTool, GitPullTool } from '../tools/GitTools';
import { EditTool } from '../tools/EditTool';
import { GlobTool } from '../tools/GlobTool';
import { Tool } from '../tools/Tool';
import { McpClient } from '../mcp/McpClient';
import { CheckpointManager } from '../checkpoint/CheckpointManager';
import { ProcessManager } from '../sys/ProcessManager';
import { BackgroundProcessTool } from '../tools/BackgroundProcessTool';
import { TaskManager } from '../agent/TaskManager';
import { TaskTool } from '../tools/TaskTool';
import { PdfReaderTool, ExcelReaderTool, JupyterReaderTool } from '../tools/SpecializedIO';
import { ScreenshotTool } from '../tools/VisionTools';
import { RipgrepTool } from '../tools/RipgrepTool';
import { AnthropicClient } from '../llm/AnthropicClient';

import { marked } from 'marked';
import TerminalRenderer from 'marked-terminal';
import highlight from 'cli-highlight';
import boxen from 'boxen';

export class ReplManager {
    private configManager: ConfigManager;
    private modelClient!: ModelClient;
    private contextManager: ContextManager;
    private checkpointManager: CheckpointManager;
    private processManager: ProcessManager;
    private taskManager: TaskManager;
    private history: ChatMessage[] = [];
    private mode: 'PLAN' | 'BUILD' = 'BUILD';
    private tools: Tool[] = [];
    private mcpClients: McpClient[] = [];
    private shell: PersistentShell;

    constructor() {
        this.configManager = new ConfigManager();
        this.contextManager = new ContextManager();
        this.checkpointManager = new CheckpointManager();
        this.shell = new PersistentShell();
        this.processManager = new ProcessManager();
        this.taskManager = new TaskManager();

        // Setup Markdown Rendering
        marked.setOptions({
            // Define custom renderer
            renderer: new TerminalRenderer({
                code: (code: any, lang: any) => {
                    return highlight(code, {
                        language: lang || 'plaintext',
                        ignoreIllegals: true
                    });
                }
            } as any) as any
        });

        this.tools = [
            new WriteFileTool(),
            new ReadFileTool(),
            new ListDirTool(),
            new SearchFileTool(),
            new PersistentShellTool(this.shell),
            new WebSearchTool(),
            new GitStatusTool(),
            new GitDiffTool(),
            new GitCommitTool(),
            new GitPushTool(),
            new GitPullTool(),
            new EditTool(),
            new GlobTool(),
            new BackgroundProcessTool(this.processManager),
            new TaskTool(this.taskManager),
            new PdfReaderTool(),
            new ExcelReaderTool(),
            new JupyterReaderTool(),
            new ScreenshotTool(),
            new RipgrepTool()
        ];
        // Default to Ollama if not specified, assuming compatible endpoint
        this.initializeClient();
    }

    private initializeClient() {
        const config = this.configManager.getConfig();
        const provider = config.defaultProvider || 'ollama';

        let baseUrl: string;
        let apiKey: string;
        let model: string;

        if (provider === 'gemini') {
            baseUrl = 'https://generativelanguage.googleapis.com/v1beta/openai/';
            apiKey = config.gemini?.apiKey || '';
            model = config.gemini?.model || 'gemini-2.5-flash';
            this.modelClient = new OpenAIClient(baseUrl, apiKey, model);
        } else if (provider === 'openai') {
            baseUrl = config.openai?.baseUrl || 'https://api.openai.com/v1';
            apiKey = config.openai?.apiKey || '';
            model = config.openai?.model || 'gpt-4o';
            this.modelClient = new OpenAIClient(baseUrl, apiKey, model);
        } else if (provider === 'anthropic') {
            apiKey = config.anthropic?.apiKey || '';
            model = config.anthropic?.model || 'claude-3-opus-20240229';
            this.modelClient = new AnthropicClient(apiKey, model);
        } else if (provider === 'groq') {
            baseUrl = 'https://api.groq.com/openai/v1';
            apiKey = config.groq?.apiKey || '';
            model = config.groq?.model || 'llama3-70b-8192';
            this.modelClient = new OpenAIClient(baseUrl, apiKey, model);
        } else if (provider === 'openrouter') {
            baseUrl = 'https://openrouter.ai/api/v1';
            apiKey = config.openrouter?.apiKey || '';
            model = config.openrouter?.model || 'anthropic/claude-3-opus';
            this.modelClient = new OpenAIClient(baseUrl, apiKey, model);
        } else { // Default to Ollama
            baseUrl = config.ollama?.baseUrl || 'http://localhost:11434/v1';
            apiKey = 'ollama';
            model = config.ollama?.model || 'llama3:latest';
            this.modelClient = new OpenAIClient(baseUrl, apiKey, model);
        }
    }

    public async start() {
        UIManager.displayLogo();
        UIManager.displayWelcome();

        while (true) {
            // Simple prompt styling for now as inquirer is limited in 'prefix' styling without custom prompts
            // We can simulate the "box" look by printing a header before the prompt if we wanted, 
            // but let's stick to a clean prompt first.
            UIManager.printSeparator();

            // Display active task if any
            const activeTask = this.taskManager.getActiveTask();
            if (activeTask) {
                console.log(chalk.blue(`  [Active Task: ${activeTask.description}]`));
            }

            console.log(chalk.dim('  ? for shortcuts'));

            const modeLabel = this.mode === 'PLAN' ? chalk.bgBlue.black(' PLAN ') : chalk.bgYellow.black(' BUILD ');

            const { input } = await inquirer.prompt([
                {
                    type: 'input',
                    name: 'input',
                    message: `${modeLabel} ${chalk.cyan('>')}`,
                    prefix: '',
                    suffix: '',
                },
            ]);

            if (!input.trim()) continue;

            if (input.startsWith('/')) {
                await this.handleCommand(input);
                continue;
            }

            await this.handleChat(input);
        }
    }

    private async handleCommand(input: string) {
        const [command, ...args] = input.split(' ');
        switch (command) {
            case '/help':
                console.log(chalk.yellow('Available commands:'));
                console.log('  /help    - Show this help message');
                console.log('  /clear   - Clear chat history');
                console.log('  /exit    - Exit the application');
                console.log('  /config  - Configure settings');
                console.log('  /add <file> - Add file to context');
                console.log('  /drop <file> - Remove file from context');
                console.log('  /plan    - Switch to PLAN mode');
                console.log('  /build   - Switch to BUILD mode');
                console.log('  /model   - Interactively select Provider & Model');
                console.log('  /use <provider> [model] - Quick switch (legacy)');
                console.log('  /mcp <cmd> - Manage MCP servers');
                console.log('  /resume  - Resume last session');
                console.log('  /checkpoint <save|load|list> [name] - Manage checkpoints');
                console.log('  /search <query> - Search codebase');
                console.log('  /run <cmd> - Run shell command');
                console.log('  /commit [msg] - Git commit all changes');
                break;
            case '/plan':
                this.mode = 'PLAN';
                console.log(chalk.blue('Switched to PLAN mode.'));
                break;
            case '/build':
                this.mode = 'BUILD';
                console.log(chalk.yellow('Switched to BUILD mode.'));
                break;
            case '/build':
                this.mode = 'BUILD';
                console.log(chalk.yellow('Switched to BUILD mode.'));
                break;
            case '/model':
                await this.handleModelCommand();
                break;
            case '/connect':
                console.log(chalk.dim('Tip: Use /model for an interactive menu.'));
                await this.handleConnectCommand(args);
                break;
            case '/use':
                await this.handleUseCommand(args);
                break;
            case '/mcp':
                await this.handleMcpCommand(args);
                break;
            case '/resume':
                await this.handleResumeCommand();
                break;
            case '/checkpoint':
                await this.handleCheckpointCommand(args);
                break;
            case '/clear':
                this.history = [];
                this.contextManager.clear();
                UIManager.displayLogo(); // Redraw logo on clear
                console.log(chalk.yellow('Chat history and context cleared.'));
                break;
            case '/add':
                if (args.length === 0) {
                    console.log(chalk.red('Usage: /add <file_path>'));
                } else {
                    const result = await this.contextManager.addFile(args[0]);
                    console.log(chalk.yellow(result));
                }
                break;
            case '/drop':
                if (args.length === 0) {
                    console.log(chalk.red('Usage: /drop <file_path>'));
                } else {
                    const result = await this.contextManager.removeFile(args[0]);
                    console.log(chalk.yellow(result));
                }
                break;
            case '/config':
                await this.handleConfigCommand();
                break;
            case '/exit':
                // Auto-save on exit
                this.checkpointManager.save('latest', this.history, this.contextManager.getFiles());
                this.shell.kill(); // Kill the shell process
                this.processManager.killAll(); // Kill background processes
                console.log(chalk.green('Session saved. Goodbye!'));
                process.exit(0);
                break;
            default:
                console.log(chalk.red(`Unknown command: ${command}`));
        }
    }

    private async handleChat(input: string) {
        const context = this.contextManager.getContextString();
        let fullInput = input;

        let modeInstruction = '';
        if (this.mode === 'PLAN') {
            modeInstruction = '\n[SYSTEM: You are in PLAN mode. Focus on high-level architecture, requirements analysis, and creating a sturdy plan. Do not write full code implementation yet, just scaffolds or pseudocode if needed.]';
        } else {
            modeInstruction = '\n[SYSTEM: You are in BUILD mode. Focus on implementing working code that solves the user request efficiently.]';
        }

        fullInput = `${input}${modeInstruction}`;

        if (context) {
            fullInput = `${context}\n\nUser Question: ${fullInput}`;
        }

        // Inject Active Tasks into context silently if needed, or just rely on agent checking.
        // For better proactivity, let's append active tasks to the system prompt part of the message.
        const activeTasks = this.taskManager.listTasks().filter(t => t.status === 'in_progress' || t.status === 'pending');
        if (activeTasks.length > 0) {
            const taskContext = activeTasks.map(t => `- [${t.status.toUpperCase()}] ${t.description} (ID: ${t.id})`).join('\n');
            fullInput += `\n\n[SYSTEM: Current Active/Pending Tasks from TaskManager:\n${taskContext}\n]`;
        }

        this.history.push({ role: 'user', content: fullInput });

        let spinner = ora('Thinking...').start();

        try {
            // First call
            let response = await this.modelClient.chat(this.history, this.tools.map(t => ({
                type: 'function',
                function: {
                    name: t.name,
                    description: t.description,
                    parameters: t.parameters
                }
            })));

            // Loop for tool calls
            while (response.tool_calls && response.tool_calls.length > 0) {
                spinner.stop();

                // Add the assistant's request to use tool to history
                this.history.push({
                    role: 'assistant',
                    content: response.content,
                    tool_calls: response.tool_calls
                });

                // Execute tools
                // Separate interactive and non-interactive tools
                const interactiveCalls = response.tool_calls.filter((tc: any) => tc.function.name === 'write_file');
                const parallelCalls = response.tool_calls.filter((tc: any) => tc.function.name !== 'write_file');

                // Execute parallel tools first
                const parallelPromises = parallelCalls.map(async (toolCall: any) => {
                    const toolName = toolCall.function.name;
                    const toolArgsStr = toolCall.function.arguments;
                    const toolArgs = JSON.parse(toolArgsStr);

                    // Truncate long arguments for display
                    let displayArgs = toolArgsStr;
                    if (displayArgs.length > 100) {
                        displayArgs = displayArgs.substring(0, 100) + '...';
                    }
                    console.log(chalk.dim(`  [Action] ${toolName}(${displayArgs})`));

                    const tool = this.tools.find(t => t.name === toolName);
                    let result = '';

                    if (tool) {
                        try {
                            result = await tool.execute(toolArgs);
                        } catch (e: any) {
                            result = `Error: ${e.message}`;
                        }
                    } else {
                        result = `Error: Tool ${toolName} not found.`;
                    }

                    return {
                        role: 'tool',
                        tool_call_id: toolCall.id,
                        name: toolName,
                        content: result
                    };
                });

                // Wait for all parallel tools
                const parallelResults = await Promise.all(parallelPromises);
                parallelResults.forEach((res: any) => this.history.push(res));

                // Execute interactive tools sequentially
                for (const toolCall of interactiveCalls) {
                    const toolName = toolCall.function.name;
                    const toolArgsStr = toolCall.function.arguments;
                    const toolArgs = JSON.parse(toolArgsStr);

                    console.log(chalk.dim(`  [Action] ${toolName}(${toolArgs.filePath})`)); // simplified log for write_file

                    spinner.stop(); // Stop spinner for input
                    const { confirm } = await inquirer.prompt([
                        {
                            type: 'confirm',
                            name: 'confirm',
                            message: `Allow writing to ${chalk.yellow(toolArgs.filePath)}?`,
                            default: true
                        }
                    ]);

                    if (!confirm) {
                        this.history.push({
                            role: 'tool',
                            tool_call_id: toolCall.id,
                            name: toolName,
                            content: 'Error: User rejected write operation.'
                        });
                        console.log(chalk.red('  Action cancelled by user.'));
                        spinner = ora('Thinking...').start();
                        continue;
                    }
                    spinner = ora('Executing...').start();

                    const tool = this.tools.find(t => t.name === toolName);
                    let result = '';
                    if (tool) {
                        try {
                            result = await tool.execute(toolArgs);
                        } catch (e: any) {
                            result = `Error: ${e.message}`;
                        }
                    }

                    this.history.push({
                        role: 'tool',
                        tool_call_id: toolCall.id,
                        name: toolName,
                        content: result
                    });
                }

                // Restart spinner for next turn
                if (!spinner.isSpinning) spinner = ora('Thinking (processing tools)...').start();

                // Get next response
                response = await this.modelClient.chat(this.history, this.tools.map(t => ({
                    type: 'function',
                    function: {
                        name: t.name,
                        description: t.description,
                        parameters: t.parameters
                    }
                })));
            }

            spinner.stop();


            console.log('');
            if (response.content) {
                console.log(chalk.bold.blue('Mentis:'));
                try {
                    console.log(marked(response.content));
                } catch (e) {
                    // Fallback if marked fails
                    console.log(response.content);
                }

                if (response.usage) {
                    const { input_tokens, output_tokens } = response.usage;
                    const totalCost = this.estimateCost(input_tokens, output_tokens);
                    console.log(chalk.dim(`\n(Tokens: ${input_tokens} in / ${output_tokens} out | Est. Cost: $${totalCost.toFixed(5)})`));
                }

                console.log('');
                this.history.push({ role: 'assistant', content: response.content });
            }
        } catch (error: any) {
            spinner.fail('Error getting response from model.');
            console.error(chalk.red(error.message));
            if (error.response && error.response.data) {
                console.error(chalk.dim(JSON.stringify(error.response.data, null, 2)));
            }
        }
    }

    private async handleConfigCommand() {
        const config = this.configManager.getConfig();
        const { action } = await inquirer.prompt([
            {
                type: 'list',
                name: 'action',
                message: 'Configuration',
                prefix: '',
                choices: [
                    'View Current Config',
                    'Switch Provider',
                    'Set Ollama Config',
                    'Set Gemini Config',
                    'Set OpenAI Config',
                    'Set Anthropic Config',
                    'Set Groq Config',
                    'Set OpenRouter Config',
                    'Back'
                ]
            }
        ]);

        if (action === 'Back') return;

        if (action === 'View Current Config') {
            console.log(JSON.stringify(config, null, 2));
            return;
        }

        if (action === 'Switch Provider') {
            const { provider } = await inquirer.prompt([{
                type: 'list',
                name: 'provider',
                message: 'Select Provider:',
                choices: ['ollama', 'gemini', 'openai', 'anthropic', 'groq', 'openrouter']
            }]);
            this.configManager.updateConfig({ defaultProvider: provider });
            this.initializeClient();
            console.log(chalk.green(`Switched to ${provider}`));
            return;
        }

        // Generic handling for "Set X Config"
        let targetProvider = '';
        if (action.includes('Ollama')) targetProvider = 'ollama';
        else if (action.includes('Gemini')) targetProvider = 'gemini';
        else if (action.includes('OpenAI')) targetProvider = 'openai';
        else if (action.includes('Anthropic')) targetProvider = 'anthropic';
        else if (action.includes('Groq')) targetProvider = 'groq';
        else if (action.includes('OpenRouter')) targetProvider = 'openrouter';

        if (targetProvider) {
            // Type safety for provider config access
            const providerConfig = (config as any)[targetProvider] || {};

            const answers = await inquirer.prompt([
                {
                    type: 'input',
                    name: 'key',
                    message: `API Key (leave empty to keep current):`,
                    when: targetProvider !== 'ollama'
                },
                {
                    type: 'input',
                    name: 'url',
                    message: `Base URL (leave empty to keep current):`,
                    default: providerConfig.baseUrl, // Only applicable for some, but harmless
                    when: targetProvider === 'ollama' || targetProvider === 'openai'
                },
                {
                    type: 'input',
                    name: 'model',
                    message: `Model (leave empty to keep current):`,
                    default: providerConfig.model
                }
            ]);

            const updates: any = {};
            updates[targetProvider] = { ...providerConfig };

            if (answers.key) updates[targetProvider].apiKey = answers.key;
            if (answers.url) updates[targetProvider].baseUrl = answers.url;
            if (answers.model) updates[targetProvider].model = answers.model;

            this.configManager.updateConfig(updates);

            // If we just updated the active provider, we should re-init
            if (config.defaultProvider === targetProvider) {
                this.initializeClient();
            }
        }

        console.log(chalk.green('Configuration updated.'));
    }

    private async handleModelCommand() {
        const { provider } = await inquirer.prompt([
            {
                type: 'list',
                name: 'provider',
                message: 'Select AI Provider:',
                choices: ['Gemini', 'Ollama', 'OpenAI', 'Anthropic', 'Groq', 'OpenRouter'],
            }
        ]);

        let models: string[] = [];
        if (provider === 'Gemini') {
            models = ['gemini-2.5-flash', 'gemini-1.5-pro', 'gemini-1.5-flash', 'Other...'];
        } else if (provider === 'Ollama') {
            models = ['llama3:latest', 'deepseek-r1:latest', 'mistral:latest', 'Other...'];
        } else if (provider === 'OpenAI') {
            models = ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'Other...'];
        } else if (provider === 'Anthropic') {
            models = ['claude-3-opus-20240229', 'claude-3-sonnet-20240229', 'claude-3-haiku-20240307', 'Other...'];
        } else if (provider === 'Groq') {
            models = ['llama3-70b-8192', 'mixtral-8x7b-32768', 'Other...'];
        } else if (provider === 'OpenRouter') {
            models = ['anthropic/claude-3-opus', 'openai/gpt-4o', 'google/gemini-pro-1.5', 'Other...'];
        }

        let { model } = await inquirer.prompt([
            {
                type: 'list',
                name: 'model',
                message: 'Select Model:',
                choices: models,
            }
        ]);

        if (model === 'Other...') {
            const { customModel } = await inquirer.prompt([{
                type: 'input',
                name: 'customModel',
                message: 'Enter model name:'
            }]);
            model = customModel;
        }

        let updates: any = {};
        const config = this.configManager.getConfig();
        const lowerProvider = provider.toLowerCase();

        if (lowerProvider === 'ollama') {
            const { baseUrl } = await inquirer.prompt([{
                type: 'input',
                name: 'baseUrl',
                message: 'Enter Base URL:',
                default: config.ollama?.baseUrl || 'http://localhost:11434/v1'
            }]);
            updates.ollama = { ...config.ollama, baseUrl, model };
            updates.defaultProvider = 'ollama';
        } else {
            // All other providers use API keys
            let currentKey = '';
            // Safely access config based on provider
            if (lowerProvider === 'gemini') currentKey = config.gemini?.apiKey || '';
            else if (lowerProvider === 'openai') currentKey = config.openai?.apiKey || '';
            else if (lowerProvider === 'anthropic') currentKey = config.anthropic?.apiKey || '';
            else if (lowerProvider === 'groq') currentKey = config.groq?.apiKey || '';
            else if (lowerProvider === 'openrouter') currentKey = config.openrouter?.apiKey || '';

            let apiKey = currentKey;

            // Only prompt if we don't have a key, OR if the user explicitly might want to change it?
            // User requested to NOT type it every time. So if we have it, we keep it.
            // If they want to change it, they can use /config or /connect.
            if (!currentKey) {
                const answer = await inquirer.prompt([{
                    type: 'password',
                    name: 'apiKey',
                    message: `Enter ${provider} API Key:`,
                    mask: '*',
                }]);
                apiKey = answer.apiKey;
            } else {
                console.log(chalk.dim(`Using existing API key for ${provider}. Use /config to change.`));
            }

            if (lowerProvider === 'gemini') {
                updates.gemini = { ...config.gemini, apiKey, model };
            } else if (lowerProvider === 'openai') {
                updates.openai = { ...config.openai, apiKey, model };
            } else if (lowerProvider === 'anthropic') {
                updates.anthropic = { ...config.anthropic, apiKey, model };
            } else if (lowerProvider === 'groq') {
                updates.groq = { ...config.groq, apiKey, model };
            } else if (lowerProvider === 'openrouter') {
                updates.openrouter = { ...config.openrouter, apiKey, model };
            }
            updates.defaultProvider = lowerProvider;
        }

        this.configManager.updateConfig(updates);
        this.initializeClient();
        console.log(chalk.green(`\nSuccessfully connected to ${provider} (${model})!`));
    }

    private async handleConnectCommand(args: string[]) {
        if (args.length < 1) {
            console.log(chalk.red('Usage: /connect <provider> [key_or_url]'));
            return;
        }

        const provider = args[0].toLowerCase();
        const value = args[1]; // Optional for ollama (defaults), required for others usually

        const config = this.configManager.getConfig();

        if (provider === 'gemini') {
            if (!value) {
                console.log(chalk.red('Error: API Key required for Gemini. usage: /connect gemini <api_key>'));
                return;
            }
            this.configManager.updateConfig({
                gemini: { ...config.gemini, apiKey: value },
                defaultProvider: 'gemini'
            });
            console.log(chalk.green(`Connected to Gemini with key: ${value.substring(0, 8)}...`));
        } else if (provider === 'ollama') {
            const url = value || 'http://localhost:11434/v1';
            this.configManager.updateConfig({
                ollama: { ...config.ollama, baseUrl: url },
                defaultProvider: 'ollama'
            });
            console.log(chalk.green(`Connected to Ollama at ${url}`));
        } else if (provider === 'openai') { // Support OpenAI since client supports it
            if (!value) {
                console.log(chalk.red('Error: API Key required for OpenAI. usage: /connect openai <api_key>'));
                return;
            }
            this.configManager.updateConfig({
                openai: { ...config.openai, apiKey: value },
                defaultProvider: 'openai' // We might need to handle 'openai' in initializeClient if we add it officially
            });
            console.log(chalk.green(`Connected to OpenAI.`));
        } else {
            console.log(chalk.red(`Unknown provider: ${provider}. Use 'gemini', 'ollama', or 'openai'.`));
            return;
        }

        this.initializeClient();
    }

    private async handleUseCommand(args: string[]) {
        if (args.length < 1) {
            console.log(chalk.red('Usage: /use <provider> [model_name]'));
            return;
        }

        const provider = args[0].toLowerCase();
        const model = args[1]; // Optional

        const config = this.configManager.getConfig();

        if (provider === 'gemini') {
            const updates: any = { defaultProvider: 'gemini' };
            if (model) {
                updates.gemini = { ...config.gemini, model: model };
            }
            this.configManager.updateConfig(updates);
        } else if (provider === 'ollama') {
            const updates: any = { defaultProvider: 'ollama' };
            if (model) {
                updates.ollama = { ...config.ollama, model: model };
            }
            this.configManager.updateConfig(updates);

            // Auto switch if connecting to a new provider
            if ((provider as string) === 'gemini') {
                updates.defaultProvider = 'gemini';
                this.configManager.updateConfig(updates);
            } else if ((provider as string) === 'ollama') {
                updates.defaultProvider = 'ollama';
                this.configManager.updateConfig(updates);
            }
        } else {
            console.log(chalk.red(`Unknown provider: ${provider}`));
            return;
        }

        this.initializeClient();
        console.log(chalk.green(`Switched to ${provider} ${model ? `using model ${model}` : ''}`));
    }

    private async handleMcpCommand(args: string[]) {
        if (args.length < 1) {
            console.log(chalk.red('Usage: /mcp <connect|list|disconnect> [args]'));
            return;
        }

        const action = args[0];

        if (action === 'connect') {
            const commandParts = args.slice(1);
            if (commandParts.length === 0) {
                console.log(chalk.red('Usage: /mcp connect <command> [args...]'));
                return;
            }

            // Example: /mcp connect npx -y @modelcontextprotocol/server-memory
            // On Windows, npx might be npx.cmd
            const cmd = process.platform === 'win32' && commandParts[0] === 'npx' ? 'npx.cmd' : commandParts[0];
            const cmdArgs = commandParts.slice(1);

            const spinner = ora(`Connecting to MCP server: ${cmd} ${cmdArgs.join(' ')}...`).start();

            try {
                const client = new McpClient(cmd, cmdArgs);
                await client.initialize();
                const mcpTools = await client.listTools();

                this.mcpClients.push(client);
                this.tools.push(...mcpTools);

                spinner.succeed(chalk.green(`Connected to ${client.serverName}!`));
                console.log(chalk.green(`Added ${mcpTools.length} tools:`));
                mcpTools.forEach(t => console.log(chalk.dim(`  - ${t.name}: ${t.description.substring(0, 50)}...`)));

            } catch (e: any) {
                spinner.fail(chalk.red(`Failed to connect: ${e.message}`));
            }

        } else if (action === 'list') {
            if (this.mcpClients.length === 0) {
                console.log('No active MCP connections.');
            } else {
                console.log(chalk.cyan('Active MCP Connections:'));
                this.mcpClients.forEach((client, idx) => {
                    console.log(`${idx + 1}. ${client.serverName}`);
                });
            }
        } else if (action === 'disconnect') {
            // Basic disconnect all for now or by index if we wanted
            console.log(chalk.yellow('Disconnecting all MCP clients...'));
            this.mcpClients.forEach(c => c.disconnect());
            this.mcpClients = [];
            // Re-init core tools
            this.tools = [
                new WriteFileTool(),
                new ReadFileTool(),
                new ListDirTool(),
                new SearchFileTool(),
                new PersistentShellTool(this.shell),
                new WebSearchTool(),
                new GitStatusTool(),
                new GitDiffTool(),
                new GitCommitTool(),
                new GitPushTool(),
                new GitPullTool(),
                new EditTool(),
                new GlobTool(),
                new BackgroundProcessTool(this.processManager),
                new TaskTool(this.taskManager),
                new PdfReaderTool(),
                new ExcelReaderTool(),
                new JupyterReaderTool(),
                new ScreenshotTool(),
                new RipgrepTool()
            ];
        } else {
            console.log(chalk.red(`Unknown MCP action: ${action}`));
        }
    }

    private async handleResumeCommand() {
        if (!this.checkpointManager.exists('latest')) {
            console.log(chalk.yellow('No previous session found to resume.'));
            return;
        }
        await this.loadCheckpoint('latest');
    }

    private async handleCheckpointCommand(args: string[]) {
        if (args.length < 1) {
            console.log(chalk.red('Usage: /checkpoint <save|load|list> [name]'));
            return;
        }
        const action = args[0];
        const name = args[1] || 'default';

        if (action === 'save') {
            this.checkpointManager.save(name, this.history, this.contextManager.getFiles());
            console.log(chalk.green(`Checkpoint '${name}' saved.`));
        } else if (action === 'load') {
            await this.loadCheckpoint(name);
        } else if (action === 'list') {
            const points = this.checkpointManager.list();
            console.log(chalk.cyan('Available Checkpoints:'));
            points.forEach(p => console.log(` - ${p}`));
        } else {
            console.log(chalk.red(`Unknown action: ${action}`));
        }
    }

    private async loadCheckpoint(name: string) {
        const cp = this.checkpointManager.load(name);
        if (!cp) {
            console.log(chalk.red(`Checkpoint '${name}' not found.`));
            return;
        }

        this.history = cp.history;
        this.contextManager.clear();

        // Restore context files
        if (cp.files && cp.files.length > 0) {
            console.log(chalk.dim('Restoring context files...'));
            for (const file of cp.files) {
                await this.contextManager.addFile(file);
            }
        }
        console.log(chalk.green(`Resumed session '${name}' (${new Date(cp.timestamp).toLocaleString()})`));
        // Re-display last assistant message if any
        const lastMsg = this.history[this.history.length - 1];
        if (lastMsg && lastMsg.role === 'assistant' && lastMsg.content) {
            console.log(chalk.blue('\nLast message:'));
            console.log(lastMsg.content);
        }
    }

    private estimateCost(input: number, output: number): number {
        const config = this.configManager.getConfig();
        const provider = config.defaultProvider;

        let rateIn = 0;
        let rateOut = 0;

        if (provider === 'openai') {
            rateIn = 5.00 / 1000000;
            rateOut = 15.00 / 1000000;
        } else if (provider === 'gemini') {
            rateIn = 0.35 / 1000000;
            rateOut = 0.70 / 1000000;
        }

        return (input * rateIn) + (output * rateOut);
    }
}
