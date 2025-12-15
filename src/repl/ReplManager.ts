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
import { Tool } from '../tools/Tool';
import { McpClient } from '../mcp/McpClient';
import { CheckpointManager } from '../checkpoint/CheckpointManager';

export class ReplManager {
    private configManager: ConfigManager;
    private modelClient!: ModelClient;
    private contextManager: ContextManager;
    private checkpointManager: CheckpointManager;
    private history: ChatMessage[] = [];
    private mode: 'PLAN' | 'BUILD' = 'BUILD';
    private tools: Tool[] = [];
    private mcpClients: McpClient[] = [];
    private shell: PersistentShell;
    private currentModelName: string = 'Unknown';

    constructor() {
        this.configManager = new ConfigManager();
        this.contextManager = new ContextManager();
        this.checkpointManager = new CheckpointManager();
        this.shell = new PersistentShell();
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
            new GitPullTool()
        ];
        // Default to Ollama if not specified, assuming compatible endpoint
        this.initializeClient();
    }

    private initializeClient() {
        const config = this.configManager.getConfig();
        const provider = config.defaultProvider || 'ollama';

        let baseUrl: string | undefined;
        let apiKey: string;
        let model: string;

        if (provider === 'gemini') {
            baseUrl = 'https://generativelanguage.googleapis.com/v1beta/openai/';
            apiKey = config.gemini?.apiKey || '';
            model = config.gemini?.model || 'gemini-2.5-flash';
        } else if (provider === 'openai') {
            baseUrl = config.openai?.baseUrl || 'https://api.openai.com/v1';
            apiKey = config.openai?.apiKey || '';
            model = config.openai?.model || 'gpt-4o';
        } else if (provider === 'glm') {
            // Use the "Coding Plan" endpoint which supports glm-4.6 and this specific key type
            baseUrl = config.glm?.baseUrl || 'https://api.z.ai/api/coding/paas/v4/';
            apiKey = config.glm?.apiKey || '';
            model = config.glm?.model || 'glm-4.6';
        } else { // Default to Ollama
            baseUrl = config.ollama?.baseUrl || 'http://localhost:11434/v1';
            apiKey = 'ollama'; // Ollama typically doesn't use an API key in the same way
            model = config.ollama?.model || 'llama3:latest';
        }

        this.currentModelName = model;
        this.modelClient = new OpenAIClient(baseUrl, apiKey, model);
        // console.log(chalk.dim(`Initialized ${provider} client with model ${model}`));
    }

    public async start() {
        UIManager.displayLogo();
        UIManager.displayWelcome();

        while (true) {
            // Simple prompt styling for now as inquirer is limited in 'prefix' styling without custom prompts
            // We can simulate the "box" look by printing a header before the prompt if we wanted, 
            // but let's stick to a clean prompt first.
            UIManager.printSeparator();
            console.log(chalk.dim(`  /help for help | Model: ${chalk.cyan(this.currentModelName)}`));

            const modeLabel = this.mode === 'PLAN' ? chalk.bgBlue.black(' PLAN ') : chalk.bgYellow.black(' BUILD ');

            const { input } = await inquirer.prompt([
                {
                    type: 'input',
                    name: 'input',
                    message: `${modeLabel} ${chalk.cyan('>')}`,
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
                await this.handleModelCommand(args);
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

        // We push the raw user input for display/history sanity, but send the mode instruction to the model
        // Actually, for simple stateless/append-only history, let's append it invisibly or just append to content.
        // Let's modify the last message specifically for the API call or just append it content-wise.
        // To keep it simple: Append to the content we push. User will see it in history? 
        // Better: Prepend system instruction to the 'messages' array for this turn if possible, or just append to user message.
        // Appending to user message is easiest for compatibility.

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
                for (const toolCall of response.tool_calls) {
                    const toolName = toolCall.function.name;
                    const toolArgsStr = toolCall.function.arguments;
                    const toolArgs = JSON.parse(toolArgsStr);

                    // Truncate long arguments for display to keep UI clean
                    let displayArgs = toolArgsStr;
                    if (displayArgs.length > 100) {
                        displayArgs = displayArgs.substring(0, 100) + '...';
                    }
                    console.log(chalk.dim(`  [Action] ${toolName}(${displayArgs})`));

                    // Safety check for write_file
                    if (toolName === 'write_file') {
                        spinner.stop(); // Stop spinner to allow input
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
                            spinner = ora('Thinking (processing rejection)...').start(); // Restart spinner
                            continue;
                        }
                        spinner = ora('Executing...').start(); // Restart spinner
                    }

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

                    // Stop spinner before next loop iteration or re-starting
                    if (spinner.isSpinning) {
                        spinner.stop();
                    }

                    // Add result to history
                    this.history.push({
                        role: 'tool',
                        tool_call_id: toolCall.id,
                        name: toolName,
                        content: result
                    });
                }

                spinner = ora('Thinking (processing tools)...').start();

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
                console.log(response.content);

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
            console.error(error.message); // Simplified error logging
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
                    'Show Current Configuration',
                    'Set Active Provider',
                    'Set API Key (for active provider)',
                    'Set Base URL (for active provider)',
                    'Back'
                ]
            }
        ]);

        if (action === 'Back') return;

        if (action === 'Show Current Configuration') {
            console.log(JSON.stringify(config, null, 2));
            return;
        }

        if (action === 'Set Active Provider') {
            const { provider } = await inquirer.prompt([{
                type: 'list',
                name: 'provider',
                message: 'Select Provider:',
                choices: ['Gemini', 'Ollama', 'OpenAI', 'GLM']
            }]);
            const key = provider.toLowerCase();
            this.configManager.updateConfig({ defaultProvider: key });
            console.log(chalk.green(`Active provider set to: ${provider}`));
            this.initializeClient();
            return;
        }

        const currentProvider = config.defaultProvider;

        if (action === 'Set API Key (for active provider)') {
            if (currentProvider === 'ollama') {
                console.log(chalk.yellow('Ollama typically does not require an API key.'));
            }
            const { value } = await inquirer.prompt([{
                type: 'password',
                name: 'value',
                message: `Enter API Key for ${currentProvider}:`,
                mask: '*'
            }]);

            const updates: any = {};
            updates[currentProvider] = { ...((config as any)[currentProvider] || {}), apiKey: value };
            this.configManager.updateConfig(updates);
            console.log(chalk.green(`API Key updated for ${currentProvider}.`));
            this.initializeClient();
        }

        if (action === 'Set Base URL (for active provider)') {
            const defaultUrl = (config as any)[currentProvider]?.baseUrl || '';
            const { value } = await inquirer.prompt([{
                type: 'input',
                name: 'value',
                message: `Enter Base URL for ${currentProvider}:`,
                default: defaultUrl
            }]);

            const updates: any = {};
            updates[currentProvider] = { ...((config as any)[currentProvider] || {}), baseUrl: value };
            this.configManager.updateConfig(updates);
            console.log(chalk.green(`Base URL updated for ${currentProvider}.`));
            this.initializeClient();
        }
    }

    private async handleModelCommand(args: string[]) {
        const config = this.configManager.getConfig();
        const provider = config.defaultProvider || 'ollama';

        // If argument provided, use it directly
        if (args.length > 0) {
            const modelName = args[0];
            const updates: any = {};
            updates[provider] = { ...((config as any)[provider] || {}), model: modelName };
            this.configManager.updateConfig(updates);
            this.initializeClient(); // Re-init with new model
            console.log(chalk.green(`\nModel set to ${chalk.bold(modelName)} for ${provider}!`));
            return;
        }

        let models: string[] = [];
        if (provider === 'gemini') {
            models = ['gemini-2.5-flash', 'gemini-1.5-pro', 'gemini-1.0-pro', 'Other...'];
        } else if (provider === 'ollama') {
            models = ['llama3:latest', 'deepseek-r1:latest', 'mistral:latest', 'Other...'];
        } else if (provider === 'openai') {
            models = ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'Other...'];
        } else if (provider === 'glm') {
            models = ['glm-4.6', 'glm-4-plus', 'glm-4', 'glm-4-air', 'glm-4-flash', 'Other...'];
        } else if (provider === 'anthropic') {
            models = ['claude-3-5-sonnet-20241022', 'claude-3-opus-20240229', 'claude-3-sonnet-20240229', 'claude-3-haiku-20240307', 'glm-4.6', 'Other...'];
        } else {
            models = ['Other...'];
        }

        console.log(chalk.blue(`Configuring model for active provider: ${chalk.bold(provider)}`));

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

        const updates: any = {};
        updates[provider] = { ...((config as any)[provider] || {}), model: model };

        this.configManager.updateConfig(updates);
        this.initializeClient();
        console.log(chalk.green(`\nModel set to ${model} for ${provider}!`));
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
        } else if (provider === 'glm') {
            if (!value) {
                console.log(chalk.red('Error: API Key required for GLM. usage: /connect glm <api_key>'));
                return;
            }
            this.configManager.updateConfig({
                glm: { ...config.glm, apiKey: value },
                defaultProvider: 'glm'
            });
            console.log(chalk.green(`Connected to GLM (ZhipuAI).`));
        } else {
            console.log(chalk.red(`Unknown provider: ${provider}. Use 'gemini', 'ollama', 'openai', or 'glm'.`));
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
        } else if (provider === 'glm') {
            const updates: any = { defaultProvider: 'glm' };
            if (model) {
                updates.glm = { ...config.glm, model: model };
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
                new GitPullTool()
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
        } else if (provider === 'glm') {
            rateIn = 14.00 / 1000000; // Approximate for GLM-4
            rateOut = 14.00 / 1000000;
        }

        return (input * rateIn) + (output * rateOut);
    }
}
