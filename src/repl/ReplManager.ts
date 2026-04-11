import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { ConfigManager } from '../config/ConfigManager';
import { ModelClient, ChatMessage } from '../llm/ModelInterface';
import { OpenAIClient } from '../llm/OpenAIClient';

import { ContextManager } from '../context/ContextManager';
import { UIManager } from '../ui/UIManager';
import { InputBox } from '../ui/InputBox';
import { DiffViewer } from '../ui/DiffViewer';
import { MultiFileSelector } from '../ui/MultiFileSelector';
import { ToolExecutor } from '../ui/ToolExecutor';
import { PlanModeUI } from '../ui/PlanModeUI';
import { WriteFileTool, ReadFileTool, ListDirTool, EditFileTool, AskQuestionTool, PlanModeTool } from '../tools/FileTools';
import { SearchFileTool } from '../tools/SearchTools';
import { PersistentShellTool } from '../tools/PersistentShellTool';
import { PersistentShell } from './PersistentShell';
import { WebSearchTool } from '../tools/WebSearchTool';
import { GitStatusTool, GitDiffTool, GitCommitTool, GitPushTool, GitPullTool } from '../tools/GitTools';
import { Tool } from '../tools/Tool';
import { McpClient } from '../mcp/McpClient';
import { McpManager } from '../mcp/McpManager';

import { CheckpointManager } from '../checkpoint/CheckpointManager';
import { SkillsManager } from '../skills/SkillsManager';
import { LoadSkillTool, ListSkillsTool, ReadSkillFileTool } from '../skills/LoadSkillTool';
import { ContextVisualizer } from '../utils/ContextVisualizer';
import { ProjectInitializer } from '../utils/ProjectInitializer';
import { ConversationCompacter } from '../utils/ConversationCompacter';
import { CommandManager } from '../commands/CommandManager';
import { SlashCommandTool, ListCommandsTool } from '../commands/SlashCommandTool';
import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { marked } from 'marked';
import TerminalRenderer from 'marked-terminal';
import { HooksManager } from '../hooks/HooksManager';
import { SettingsManager } from '../settings/SettingsManager';
import { PermissionManager } from '../permissions/PermissionManager';
import { TodoWriteTool, TodoReadTool, clearTodos } from '../tools/TodoTools';
import { WebFetchTool } from '../tools/WebFetchTool';

const HISTORY_FILE = path.join(os.homedir(), '.mentis_history');

export interface CliOptions {
    resume: boolean;
    yolo: boolean;
    headless: boolean;
    headlessPrompt?: string;
}

export class ReplManager {
    private configManager: ConfigManager;
    private modelClient!: ModelClient;
    private contextManager: ContextManager;
    private checkpointManager: CheckpointManager;
    private skillsManager: SkillsManager;
    private contextVisualizer: ContextVisualizer;
    private conversationCompacter: ConversationCompacter;
    private commandManager: CommandManager;
    private history: ChatMessage[] = [];
    private mode: 'PLAN' | 'BUILD' = 'BUILD';
    private tools: Tool[] = [];
    private mcpClients: McpClient[] = [];
    private mcpManager: McpManager;
    private shell: PersistentShell;
    private currentModelName: string = 'Unknown';
    private activeSkill: string | null = null;  // Track currently active skill for allowed-tools
    private settingsManager: SettingsManager;
    private hooksManager: HooksManager;
    private permissionManager: PermissionManager;
    private sessionId: string;
    private options: CliOptions;

    constructor(options: CliOptions = { resume: false, yolo: false, headless: false }) {
        this.options = options;
        this.configManager = new ConfigManager();
        this.contextManager = new ContextManager();
        this.checkpointManager = new CheckpointManager();
        this.skillsManager = new SkillsManager();
        this.contextVisualizer = new ContextVisualizer();
        this.conversationCompacter = new ConversationCompacter();
        this.commandManager = new CommandManager();
        this.mcpManager = new McpManager();
        this.shell = new PersistentShell();
        this.sessionId = Date.now().toString(36);
        this.settingsManager = new SettingsManager();
        this.hooksManager = new HooksManager(this.settingsManager.getHooks());
        this.permissionManager = new PermissionManager(
            this.settingsManager.getPermissions(),
            options.yolo
        );

        // Create tools array without skill tools first
        this.tools = [
            new PlanModeTool(), // AI can suggest plan mode for complex tasks
            new AskQuestionTool(), // For plan mode questions
            new WriteFileTool(),
            new EditFileTool(),
            new ReadFileTool(),
            new ListDirTool(),
            new SearchFileTool(), // grep
            new WebSearchTool(),
            new GitStatusTool(),
            new GitDiffTool(),
            new GitCommitTool(),
            new GitPushTool(),
            new GitPullTool(),
            new PersistentShellTool(this.shell), // /run
            new TodoWriteTool(),
            new TodoReadTool(),
            new WebFetchTool(),
        ];

        // Configure Markdown Renderer
        marked.setOptions({
            // @ts-ignore
            renderer: new TerminalRenderer()
        });
        // Default to Ollama if not specified, assuming compatible endpoint
        this.initializeClient();

        // Initialize skills system after client is ready
        this.initializeSkills();
    }

    /**
     * Initialize the skills and custom commands system
     */
    private async initializeSkills() {
        // Initialize skills
        this.skillsManager.ensureDirectoriesExist();
        await this.skillsManager.discoverSkills();

        // Initialize custom commands
        this.commandManager.ensureDirectoriesExist();
        await this.commandManager.discoverCommands();

        // Add skill tools to the tools list
        // Pass callback to LoadSkillTool to track active skill
        this.tools.push(
            new LoadSkillTool(this.skillsManager, (skill) => {
                this.activeSkill = skill ? skill.name : null;
            }),
            new ListSkillsTool(this.skillsManager),
            new ReadSkillFileTool(this.skillsManager),
            new SlashCommandTool(this.commandManager),
            new ListCommandsTool(this.commandManager)
        );

        // Auto-connect to MCP servers
        await this.mcpManager.autoConnect();
        this.refreshToolsFromMcp();
    }

    /**
     * Refresh tools list from MCP connections
     */
    private refreshToolsFromMcp() {
        // Remove existing MCP tools (keep core tools)
        this.tools = this.tools.filter(tool => 
            !tool.name.startsWith('mcp_') && 
            !['load_skill', 'list_skills', 'read_skill_file', 'slash_command', 'list_commands'].includes(tool.name)
        );

        // Add MCP tools
        const mcpTools = this.mcpManager.getAllTools();
        this.tools.push(...mcpTools);

        // Re-add skill tools
        this.tools.push(
            new LoadSkillTool(this.skillsManager, (skill) => {
                this.activeSkill = skill ? skill.name : null;
            }),
            new ListSkillsTool(this.skillsManager),
            new ReadSkillFileTool(this.skillsManager),
            new SlashCommandTool(this.commandManager),
            new ListCommandsTool(this.commandManager)
        );
    }

    /**
     * Check if a tool is allowed by the currently active skill
     * Returns true if tool is allowed, false if it requires confirmation
     */
    private isToolAllowedBySkill(toolName: string): boolean {
        if (!this.activeSkill) {
            // No active skill, all tools require confirmation as per normal flow
            return false;
        }

        const skill = this.skillsManager.getSkill(this.activeSkill);
        if (!skill || !skill.allowedTools || skill.allowedTools.length === 0) {
            // No skill or no allowed-tools restriction
            return false;
        }

        // Map tool names to allowed tool names
        const toolMapping: Record<string, string> = {
            'write_file': 'Write',
            'read_file': 'Read',
            'edit_file': 'Edit',
            'search_files': 'Grep',
            'list_dir': 'ListDir',
            'search_file': 'SearchFile',
            'run_shell': 'RunShell',
            'search_web': 'WebSearch',
            'git_status': 'GitStatus',
            'git_diff': 'GitDiff',
            'git_commit': 'GitCommit',
            'git_push': 'GitPush',
            'git_pull': 'GitPull',
            'load_skill': 'Read',
            'list_skills': 'Read',
            'read_skill_file': 'Read',
            'slash_command': 'Read',
            'list_commands': 'Read'
        };

        const mappedToolName = toolMapping[toolName] || toolName;
        return skill.allowedTools.includes(mappedToolName);
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
        await this.hooksManager.run('SessionStart', { sessionId: this.sessionId });
        // Headless mode: non-interactive, process prompt and exit
        if (this.options.headless && this.options.headlessPrompt) {
            await this.handleChat(this.options.headlessPrompt);
            process.exit(0);
            return;
        }

        UIManager.renderDashboard({
            model: this.currentModelName,
            mode: this.mode,
            cwd: process.cwd()
        });

        // Auto-resume if --resume flag is set
        if (this.options.resume) {
            // Prefer local (per-directory) session, fall back to global
            const cwd = process.cwd();
            let cp = this.checkpointManager.loadLocalSession(cwd);
            let source = 'local';
            if (!cp) {
                cp = this.checkpointManager.load('latest');
                source = 'global';
            }
            if (cp) {
                this.history = cp.history;
                console.log(chalk.green(`\n✓ Resumed ${source} session from ${new Date(cp.timestamp).toLocaleString()}`));
                console.log(chalk.dim(`  Messages: ${this.history.length}\n`));
            } else {
                console.log(chalk.yellow('\n⚠ No previous session found to resume.\n'));
            }
        }

        // Load History
        let commandHistory: string[] = [];
        if (fs.existsSync(HISTORY_FILE)) {
            try {
                commandHistory = fs.readFileSync(HISTORY_FILE, 'utf-8').split('\n').filter(Boolean).reverse();
            } catch (e) { }
        }

        // Initialize InputBox with history
        const inputBox = new InputBox(commandHistory);

        while (true) {
            // Calculate context usage for display
            const usage = this.contextVisualizer.calculateUsage(this.history);

            // Display enhanced input frame
            inputBox.displayFrame({
                messageCount: this.history.length,
                contextPercent: usage.percentage
            });

            // Get styled input
            const answer = await inputBox.prompt({
                showHint: this.history.length === 0,
                hint: 'Type your message or /help for commands'
            });

            const input = answer.trim();

            if (input) {
                // Update history via InputBox
                inputBox.addToHistory(input);

                // Append to file
                try {
                    fs.appendFileSync(HISTORY_FILE, input + '\n');
                } catch (e) { }
            }

            if (!input) continue;

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
                console.log('  /update  - Check for and install updates');
                console.log('  /config  - Configure settings');
                console.log('  /add <file> - Add file to context');
                console.log('  /drop <file> - Remove file from context');
                console.log('  /plan    - Switch to PLAN mode');
                console.log('  /build   - Switch to BUILD mode');
                console.log('  /model   - Interactively select Provider & Model');
                console.log('  /use <provider> [model] - Quick switch (legacy)');
                console.log('  /mcp <cmd> - Manage MCP servers');
                console.log('  /skills <list|show|create|validate> - Manage Agent Skills');
                console.log('  /commands <list|create|validate> - Manage Custom Commands');
                console.log('  /resume  - Resume last session');
                console.log('  /search <query> - Search codebase');
                console.log('  /run <cmd> - Run shell command');
                console.log('  /commit [msg] - Git commit all changes');
                console.log('  /init    - Initialize project with .mentis.md');
                break;
            case '/plan':
                this.mode = 'PLAN';
                UIManager.logBullet('Entered plan mode', 'magenta');
                PlanModeUI.showPlanHeader();
                PlanModeUI.showQAHistory();
                break;
            case '/build':
                this.mode = 'BUILD';
                UIManager.logBullet('Entered build mode', 'green');
                PlanModeUI.showPlanSummary();
                UIManager.logSystem('Mentis is building the solution...');
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
            case '/clear':
                this.history = [];
                clearTodos();
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
                // Auto-save on exit (both local and global)
                const cwd = process.cwd();
                this.checkpointManager.saveLocalSession(cwd, this.history, this.contextManager.getFiles());
                this.checkpointManager.save('latest', this.history, this.contextManager.getFiles());
                this.shell.kill(); // Kill the shell process
                this.mcpManager.disconnectAll(); // Disconnect all MCP connections
                console.log(chalk.green('Session saved to .mentis/sessions/. Goodbye!'));
                await this.hooksManager.run('Stop', { sessionId: this.sessionId });
                process.exit(0);
                break;
            case '/update':
                const UpdateManager = require('../utils/UpdateManager').UpdateManager;
                const updater = new UpdateManager();
                await updater.checkAndPerformUpdate(true);
                break;
            case '/clear':
                this.history = [];
                clearTodos();
                console.log(chalk.green('\n✓ Context cleared\n'));
                break;
            case '/init':
                await this.handleInitCommand();
                break;
            case '/skills':
                await this.handleSkillsCommand(args);
                break;
            case '/commands':
                await this.handleCommandsCommand(args);
                break;
            default:
                console.log(chalk.red(`Unknown command: ${command}`));
        }
    }

    private getLoadingMessage(): string {
        const messages = [
            "Reticulating splines...",
            "Consulting the silicon oracle...",
            "Compiling neural pathways...",
            "Optimizing flux capacitors...",
            "Analyzing project structure...",
            "Deciphering your intent...",
            "Brewing digital coffee...",
            "Checking for infinite loops...",
            "Connecting to the matrix...",
            "Calculating the answer (42?)...",
            "Refactoring the universe...",
            "Downloading more RAM...",
            "Searching for bugs...",
            "Asking the rubber duck...",
            "Hyperspacing..."
        ];
        return messages[Math.floor(Math.random() * messages.length)];
    }

    private async handleChat(input: string) {
        const context = this.contextManager.getContextString();
        const skillsContext = this.skillsManager.getSkillsContext();
        const commandsContext = this.commandManager.getCommandsContext();
        let fullInput = input;

        let modeInstruction = '';
        if (this.mode === 'PLAN') {
            modeInstruction = '\n[SYSTEM: You are in PLAN mode. Focus on high-level architecture, requirements analysis, and creating a sturdy plan. Do not write full code implementation yet, just scaffolds or pseudocode if needed.]';
        } else {
            modeInstruction = '\n[SYSTEM: You are in BUILD mode. Focus on implementing working code that solves the user request efficiently.]';
        }

        fullInput = `${input}${modeInstruction}`;

        // Add skills context if available
        if (skillsContext) {
            fullInput = `${skillsContext}\n\n${fullInput}`;
        }

        // Add commands context if available
        if (commandsContext) {
            fullInput = `${commandsContext}\n\n${fullInput}`;
        }

        if (context) {
            fullInput = `${context}\n\nUser Question: ${fullInput}`;
        }

        this.history.push({ role: 'user', content: fullInput });

        const msg = this.getLoadingMessage();
        let spinner = ora({ text: `  ${msg}`, color: 'cyan' }).start();
        const controller = new AbortController();

        // Setup cancellation listener
        const keyListener = (str: string, key: any) => {
            if (key.name === 'escape') {
                controller.abort();
            }
        };

        if (process.stdin.isTTY) {
            readline.emitKeypressEvents(process.stdin);
            process.stdin.setRawMode(true);
            process.stdin.on('keypress', keyListener);
        }

        try {
            // First call
            let response = await this.modelClient.chat(this.history, this.tools.map(t => ({
                type: 'function',
                function: {
                    name: t.name,
                    description: t.description,
                    parameters: t.parameters
                }
            })), controller.signal);

            // Loop for tool calls
            while (response.tool_calls && response.tool_calls.length > 0) {
                if (controller.signal.aborted) throw new Error('Request cancelled by user');

                spinner.stop();

                // Add the assistant's request to use tool to history
                this.history.push({
                    role: 'assistant',
                    content: response.content,
                    tool_calls: response.tool_calls
                });

                // Execute tools
                for (const toolCall of response.tool_calls) {
                    if (controller.signal.aborted) break;

                    const toolName = toolCall.function.name;
                    const toolArgsStr = toolCall.function.arguments;
                    const toolArgs = JSON.parse(toolArgsStr);

                    // Show tool execution with visual feedback
                    ToolExecutor.showInline(toolName, toolArgs);

                    // Safety checks for write/edit operations
                    // Skip confirmation if tool is allowed by active skill
                    let approved = true;

                    // Check deny first
                    if (this.permissionManager.isDenied(toolName)) {
                        this.history.push({
                            role: 'tool',
                            tool_call_id: toolCall.id,
                            name: toolName,
                            content: `Error: Tool '${toolName}' is denied by permission settings.`,
                        });
                        continue;
                    }

                    // Skill-level allowedTools still takes precedence for approval bypass
                    const skillAllows = this.isToolAllowedBySkill(
                        toolName === 'read_file' ? 'Read' : 'Write'
                    );
                    const needsApproval = !skillAllows && this.permissionManager.needsApproval(toolName);

                    if (needsApproval) {
                        // Pause cancellation listener during user interaction
                        if (process.stdin.isTTY) {
                            process.stdin.removeListener('keypress', keyListener);
                            process.stdin.setRawMode(false);
                            process.stdin.pause();
                        }

                        // Handle write_file with diff preview
                        if (toolName === 'write_file') {
                            approved = await this.handleWriteApproval(toolArgs.filePath, toolArgs.content);
                        }

                        // Handle edit_file with diff preview
                        if (toolName === 'edit_file') {
                            approved = await this.handleEditApproval(toolArgs);
                        }

                        // Handle read_file with multi-file selector
                        if (toolName === 'read_file') {
                            approved = await this.handleReadApproval(toolArgs.filePath);
                        }

                        // Resume cancellation listener
                        if (process.stdin.isTTY) {
                            process.stdin.setRawMode(true);
                            process.stdin.resume();
                            process.stdin.on('keypress', keyListener);
                        }
                    }

                    if (!approved) {
                        this.history.push({
                            role: 'tool',
                            tool_call_id: toolCall.id,
                            name: toolName,
                            content: 'Error: User rejected operation.'
                        });
                        console.log(chalk.red('  Action cancelled by user.'));
                        continue;
                    }

                    // PreToolUse hook — can block execution
                    const hookAllowed = await this.hooksManager.run('PreToolUse', {
                        toolName,
                        toolArgs,
                        sessionId: this.sessionId,
                    });
                    if (!hookAllowed) {
                        this.history.push({
                            role: 'tool',
                            tool_call_id: toolCall.id,
                            name: toolName,
                            content: `Error: Tool execution blocked by PreToolUse hook.`,
                        });
                        continue;
                    }

                    const tool = this.tools.find(t => t.name === toolName);
                    let result = '';

                    if (tool) {
                        try {
                            result = await tool.execute(toolArgs);

                            // Record Q&A for ask_question tool in plan mode
                            if (toolName === 'ask_question' && this.mode === 'PLAN') {
                                PlanModeUI.recordQA(toolArgs.question, result);
                            }

                            // Handle plan mode switch approval
                            if (toolName === 'enter_plan_mode' && result.includes('User approved')) {
                                this.mode = 'PLAN';
                                UIManager.logBullet('Auto-switched to plan mode', 'magenta');
                            }
                        } catch (e: any) {
                            result = `Error: ${e.message}`;
                        }
                    } else {
                        result = `Error: Tool ${toolName} not found.`;
                    }

                    await this.hooksManager.run('PostToolUse', {
                        toolName,
                        toolArgs,
                        toolResult: typeof result === 'string' ? result : JSON.stringify(result),
                        sessionId: this.sessionId,
                    });

                    this.history.push({
                        role: 'tool',
                        tool_call_id: toolCall.id,
                        name: toolName,
                        content: result
                    });
                }

                if (controller.signal.aborted) throw new Error('Request cancelled by user');

                const msg = this.getLoadingMessage();
                spinner = ora({ text: `  ${msg}`, color: 'cyan' }).start();

                // Get next response
                response = await this.modelClient.chat(this.history, this.tools.map(t => ({
                    type: 'function',
                    function: {
                        name: t.name,
                        description: t.description,
                        parameters: t.parameters
                    }
                })), controller.signal);
            }

            spinner.stop();

            console.log('');
            if (response.content) {
                UIManager.logBullet('Mentis:', 'magenta');
                console.log(marked(response.content));

                if (response.usage) {
                    const { input_tokens, output_tokens } = response.usage;
                    const totalCost = this.estimateCost(input_tokens, output_tokens);
                    console.log(chalk.dim(`\n(Tokens: ${input_tokens} in / ${output_tokens} out | Est. Cost: $${totalCost.toFixed(5)})`));
                }

                // Display context bar
                const contextBar = this.contextVisualizer.getContextBar(this.history);
                console.log(chalk.dim(`\n${contextBar}`));

                console.log('');
                this.history.push({ role: 'assistant', content: response.content });

                // Auto-compact prompt when context is at 80%
                const usage = this.contextVisualizer.calculateUsage(this.history);
                if (usage.percentage >= 80) {
                    this.history = await this.conversationCompacter.promptIfCompactNeeded(
                        usage.percentage,
                        this.history,
                        this.modelClient,
                        this.options.yolo
                    );
                }
            }
        } catch (error: any) {
            spinner.stop();
            if (error.message === 'Request cancelled by user') {
                console.log(chalk.yellow('\nRequest cancelled by user.'));
            } else {
                spinner.fail('Error getting response from model.');
                console.error(error.message);
            }
        } finally {
            if (process.stdin.isTTY) {
                process.stdin.removeListener('keypress', keyListener);
                process.stdin.setRawMode(false);
                process.stdin.pause(); // Reset flow
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
        const currentProvider = config.defaultProvider || 'ollama';

        // Direct argument: /model gpt-4o (updates active provider's model)
        if (args.length > 0) {
            const modelName = args[0];
            const updates: any = {};
            updates[currentProvider] = { ...((config as any)[currentProvider] || {}), model: modelName };
            this.configManager.updateConfig(updates);
            this.initializeClient(); // Re-init with new model
            console.log(chalk.green(`\nModel set to ${chalk.bold(modelName)} for ${currentProvider}!`));
            return;
        }

        // Interactive Mode: Streamlined Provider -> Model Flow
        console.log(chalk.cyan('Configure Model & Provider'));

        const { provider } = await inquirer.prompt([
            {
                type: 'list',
                name: 'provider',
                message: 'Select Provider:',
                choices: ['Gemini', 'Ollama', 'OpenAI', 'GLM'],
                default: currentProvider.charAt(0).toUpperCase() + currentProvider.slice(1) // Capitalize for default selection
            }
        ]);

        const selectedProvider = provider.toLowerCase();

        let models: string[] = [];
        if (selectedProvider === 'gemini') {
            models = ['gemini-2.5-flash', 'gemini-1.5-pro', 'gemini-1.0-pro', 'Other...'];
        } else if (selectedProvider === 'ollama') {
            models = ['llama3:latest', 'deepseek-r1:latest', 'mistral:latest', 'qwen2.5-coder', 'Other...'];
        } else if (selectedProvider === 'openai') {
            models = ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'Other...'];
        } else if (selectedProvider === 'glm') {
            models = ['glm-4.6', 'glm-4-plus', 'glm-4', 'glm-4-air', 'glm-4-flash', 'Other...'];
        } else {
            models = ['Other...'];
        }

        let { model } = await inquirer.prompt([
            {
                type: 'list',
                name: 'model',
                message: `Select Model for ${provider}:`,
                choices: models,
                // Try to find current model in list to set default
                default: (config as any)[selectedProvider]?.model
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

        // Check for missing API Key (except for Ollama)
        let newApiKey = undefined;
        const currentKey = (config as any)[selectedProvider]?.apiKey;

        if (selectedProvider !== 'ollama' && !currentKey) {
            console.log(chalk.yellow(`\n⚠️ No API Key found for ${provider}.`));
            const { apiKey } = await inquirer.prompt([{
                type: 'password',
                name: 'apiKey',
                message: `Enter API Key for ${provider} (or leave empty to skip):`,
                mask: '*'
            }]);
            if (apiKey && apiKey.trim()) {
                newApiKey = apiKey.trim();
            }
        }

        const updates: any = {};
        updates.defaultProvider = selectedProvider;
        updates[selectedProvider] = {
            ...((config as any)[selectedProvider] || {}),
            model: model
        };

        if (newApiKey) {
            updates[selectedProvider].apiKey = newApiKey;
        }

        this.configManager.updateConfig(updates);
        this.initializeClient();
        console.log(chalk.green(`\nSwitched to ${chalk.bold(provider)} (${model})!`));
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
        if (args.length === 0) {
            console.log(chalk.red('Usage: /mcp <list|connect|disconnect|add|remove|test|config> [args]'));
            console.log(chalk.dim('\nExamples:'));
            console.log(chalk.dim('  /mcp list                    - List all MCP servers'));
            console.log(chalk.dim('  /mcp connect Exa\\ Search     - Connect to Exa Search'));
            console.log(chalk.dim('  /mcp disconnect all           - Disconnect all servers'));
            console.log(chalk.dim('  /mcp add MyServer npx -y @my/mcp-server'));
            console.log(chalk.dim('  /mcp test Exa\\ Search         - Test connection'));
            console.log(chalk.dim('  /mcp config                   - Show configuration'));
            return;
        }

        const action = args[0];

        switch (action) {
            case 'list':
                await this.mcpManager.listServers();
                break;

            case 'connect':
                if (args.length < 2) {
                    // Show interactive list of available servers
                    const availableServers = this.mcpManager.getAvailableServers();
                    if (availableServers.length === 0) {
                        console.log(chalk.yellow('No MCP servers configured. Use /mcp add to add one.'));
                        return;
                    }

                    const { serverName } = await inquirer.prompt([{
                        type: 'list',
                        name: 'serverName',
                        message: 'Select server to connect:',
                        choices: availableServers.map(s => s.name)
                    }]);

                    await this.mcpManager.connectToServer(serverName);
                    this.refreshToolsFromMcp();
                } else {
                    const serverName = args.slice(1).join(' ');
                    await this.mcpManager.connectToServer(serverName);
                    this.refreshToolsFromMcp();
                }
                break;

            case 'disconnect':
                if (args.length < 2) {
                    // Interactive disconnect
                    const connectedServers = this.mcpManager.getServerNames();
                    if (connectedServers.length === 0) {
                        console.log(chalk.yellow('No MCP connections to disconnect.'));
                        return;
                    }

                    const { serverName } = await inquirer.prompt([{
                        type: 'list',
                        name: 'serverName',
                        message: 'Select server to disconnect:',
                        choices: [...connectedServers, 'all']
                    }]);

                    if (serverName === 'all') {
                        this.mcpManager.disconnectAll();
                        this.refreshToolsFromMcp();
                    } else {
                        await this.mcpManager.disconnectFromServer(serverName);
                        this.refreshToolsFromMcp();
                    }
                } else {
                    const serverName = args.slice(1).join(' ');
                    if (serverName === 'all') {
                        this.mcpManager.disconnectAll();
                        this.refreshToolsFromMcp();
                    } else {
                        await this.mcpManager.disconnectFromServer(serverName);
                        this.refreshToolsFromMcp();
                    }
                }
                break;

            case 'add':
                if (args.length < 3) {
                    console.log(chalk.red('Usage: /mcp add <name> <command> [args...]'));
                    console.log(chalk.dim('\nExamples:'));
                    console.log(chalk.dim('  /mcp add "My Server" npx -y @my/mcp-server'));
                    console.log(chalk.dim('  /mcp add "Local Server" node /path/to/server.js'));
                    return;
                }

                const name = args[1];
                const command = args[2];
                const mcpArgs = args.slice(3);

                const { description } = await inquirer.prompt([{
                    type: 'input',
                    name: 'description',
                    message: 'Description (optional):',
                    default: ''
                }]);

                await this.mcpManager.addServer(name, command, mcpArgs, description);
                break;

            case 'remove':
                if (args.length < 2) {
                    // Interactive remove
                    const availableServers = this.mcpManager.getAvailableServers();
                    if (availableServers.length === 0) {
                        console.log(chalk.yellow('No MCP servers configured.'));
                        return;
                    }

                    const { serverName } = await inquirer.prompt([{
                        type: 'list',
                        name: 'serverName',
                        message: 'Select server to remove:',
                        choices: availableServers.map(s => s.name)
                    }]);

                    await this.mcpManager.removeServer(serverName);
                } else {
                    const serverName = args.slice(1).join(' ');
                    await this.mcpManager.removeServer(serverName);
                }
                break;

            case 'test':
                if (args.length < 2) {
                    // Interactive test
                    const connectedServers = this.mcpManager.getServerNames();
                    if (connectedServers.length === 0) {
                        console.log(chalk.yellow('No MCP connections to test.'));
                        return;
                    }

                    const { serverName } = await inquirer.prompt([{
                        type: 'list',
                        name: 'serverName',
                        message: 'Select server to test:',
                        choices: connectedServers
                    }]);

                    await this.mcpManager.testConnection(serverName);
                } else {
                    const serverName = args.slice(1).join(' ');
                    await this.mcpManager.testConnection(serverName);
                }
                break;

            case 'config':
                const config = this.mcpManager.getConfig().getConfig();
                console.log(chalk.cyan('\nMCP Configuration:\n'));
                console.log(JSON.stringify(config, null, 2));
                console.log(chalk.dim(`\nConfig file: ${require('os').homedir()}/.mentis/mcp.json`));
                break;

            default:
                console.log(chalk.red(`Unknown MCP action: ${action}`));
                console.log(chalk.yellow('Available actions: list, connect, disconnect, add, remove, test, config'));
        }
    }

    private async handleResumeCommand() {
        const cwd = process.cwd();
        const localSessions = this.checkpointManager.listLocalSessions(cwd);
        const globalCheckpoints = this.checkpointManager.list();

        if (localSessions.length === 0 && globalCheckpoints.length === 0) {
            console.log(chalk.yellow('No previous sessions found to resume.'));
            return;
        }

        // Header like Claude's "Resume Session"
        console.log('');
        console.log(chalk.cyan.bold('Resume Session'));
        console.log('');

        // Helper for relative time
        const relativeTime = (ts: number) => {
            const diff = Date.now() - ts;
            const mins = Math.floor(diff / 60000);
            const hours = Math.floor(diff / 3600000);
            const days = Math.floor(diff / 86400000);
            if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
            if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
            if (mins > 0) return `${mins} min${mins > 1 ? 's' : ''} ago`;
            return 'just now';
        };

        // Build choices with simple single-line formatting
        const choices: Array<{ name: string; value: { type: string; id: string } }> = [];

        // Local sessions first
        for (const session of localSessions) {
            const timeAgo = relativeTime(session.timestamp);
            const shortPreview = session.preview.substring(0, 30).replace(/\n/g, ' ');
            choices.push({
                name: `${shortPreview}... (${timeAgo}, ${session.messageCount} msgs)`,
                value: { type: 'local', id: session.id }
            });
        }

        // Global checkpoints as fallback
        if (localSessions.length === 0 && globalCheckpoints.length > 0) {
            for (const name of globalCheckpoints) {
                const cp = this.checkpointManager.load(name);
                const timeAgo = cp ? relativeTime(cp.timestamp) : '';
                const msgCount = cp?.history?.length || 0;
                const preview = cp?.history?.find(m => m.role === 'user')?.content?.substring(0, 40)?.replace(/\n/g, ' ') || name;
                choices.push({
                    name: `${preview}${preview.length >= 40 ? '...' : ''} — ${timeAgo} · ${msgCount} msgs`,
                    value: { type: 'global', id: name }
                });
            }
        }

        // Show hint
        console.log(chalk.dim('  ↑/↓ to navigate · Enter to select · Esc to cancel'));
        console.log('');

        // Guard against empty choices (would crash inquirer)
        if (choices.length === 0) {
            console.log(chalk.yellow('No sessions available. Start a conversation and /exit to save.'));
            return;
        }

        const { selected } = await inquirer.prompt([{
            type: 'rawlist',
            name: 'selected',
            message: 'Pick a session:',
            choices,
            pageSize: 10
        }]);

        if (selected.type === 'local') {
            await this.loadLocalCheckpoint(cwd, selected.id);
        } else if (selected.type === 'global') {
            await this.loadCheckpoint(selected.id);
        }
    }

    private async loadLocalCheckpoint(cwd: string, sessionId?: string) {
        const cp = this.checkpointManager.loadLocalSession(cwd, sessionId);
        if (!cp) {
            console.log(chalk.red('Session not found.'));
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
        console.log(chalk.green(`✓ Resumed session (${new Date(cp.timestamp).toLocaleString()})`));
        console.log(chalk.dim(`  Messages: ${this.history.length}`));

        // Re-display last assistant message if any
        const lastMsg = this.history[this.history.length - 1];
        if (lastMsg && lastMsg.role === 'assistant' && lastMsg.content) {
            console.log(chalk.blue('\nLast response:'));
            const preview = lastMsg.content.length > 200
                ? lastMsg.content.substring(0, 200) + '...'
                : lastMsg.content;
            console.log(chalk.dim(preview));
        }
        console.log('');
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

    private async handleSkillsCommand(args: string[]) {
        const { SkillCreator, validateSkills } = await import('../skills/SkillCreator');

        if (args.length < 1) {
            // Show skills list by default
            await this.handleSkillsCommand(['list']);
            return;
        }

        const action = args[0];

        switch (action) {
            case 'list':
                await this.handleSkillsList();
                break;
            case 'show':
                if (args.length < 2) {
                    console.log(chalk.red('Usage: /skills show <name>'));
                    return;
                }
                await this.handleSkillsShow(args[1]);
                break;
            case 'create':
                const creator = new SkillCreator(this.skillsManager);
                await creator.run(args[1]);
                // Re-discover skills after creation
                await this.skillsManager.discoverSkills();
                break;
            case 'validate':
                await validateSkills(this.skillsManager);
                break;
            default:
                console.log(chalk.red(`Unknown skills action: ${action}`));
                console.log(chalk.yellow('Available actions: list, show, create, validate'));
        }
    }

    private async handleSkillsList(): Promise<void> {
        const skills = this.skillsManager.getAllSkills();

        if (skills.length === 0) {
            console.log(chalk.yellow('No skills available.'));
            console.log(chalk.dim('Create skills with: /skills create'));
            console.log(chalk.dim('Add skills to: ~/.mentis/skills/ or .mentis/skills/'));
            return;
        }

        console.log(chalk.cyan(`\nAvailable Skills (${skills.length}):\n`));

        for (const skill of skills) {
            const statusIcon = skill.isValid ? '✓' : '✗';
            const typeLabel = skill.type === 'personal' ? 'Personal' : 'Project';

            console.log(`${statusIcon} ${chalk.bold(skill.name)} (${typeLabel})`);
            console.log(`  ${skill.description}`);

            if (skill.allowedTools && skill.allowedTools.length > 0) {
                console.log(chalk.dim(`  Allowed tools: ${skill.allowedTools.join(', ')}`));
            }

            if (!skill.isValid && skill.errors) {
                console.log(chalk.red(`  Errors: ${skill.errors.join(', ')}`));
            }

            console.log('');
        }
    }

    private async handleSkillsShow(name: string): Promise<void> {
        const skill = await this.skillsManager.loadFullSkill(name);

        if (!skill) {
            console.log(chalk.red(`Skill "${name}" not found.`));
            return;
        }

        console.log(chalk.cyan(`\n# ${skill.name}\n`));
        console.log(chalk.dim(`Type: ${skill.type}`));
        console.log(chalk.dim(`Path: ${skill.path}`));

        if (skill.allowedTools && skill.allowedTools.length > 0) {
            console.log(chalk.dim(`Allowed tools: ${skill.allowedTools.join(', ')}`));
        }

        console.log('');
        console.log(skill.content || 'No content available');

        // List supporting files
        const files = this.skillsManager.listSkillFiles(name);
        if (files.length > 0) {
            console.log(chalk.dim(`\nSupporting files: ${files.join(', ')}`));
        }
    }

    private async handleInitCommand(): Promise<void> {
        const initializer = new ProjectInitializer();
        await initializer.run();
    }

    private async handleCommandsCommand(args: string[]) {
        if (args.length < 1) {
            // Show commands list by default
            await this.handleCommandsCommand(['list']);
            return;
        }

        const action = args[0];

        switch (action) {
            case 'list':
                await this.handleCommandsList();
                break;
            case 'create':
                await this.handleCommandsCreate(args[1]);
                break;
            case 'validate':
                await this.handleCommandsValidate();
                break;
            default:
                console.log(chalk.red(`Unknown commands action: ${action}`));
                console.log(chalk.yellow('Available actions: list, create, validate'));
        }
    }

    private async handleCommandsList(): Promise<void> {
        const commands = this.commandManager.getAllCommands();

        if (commands.length === 0) {
            console.log(chalk.yellow('No custom commands available.'));
            console.log(chalk.dim('Create commands with: /commands create'));
            console.log(chalk.dim('Add commands to: ~/.mentis/commands/ or .mentis/commands/'));
            return;
        }

        console.log(chalk.cyan(`\nCustom Commands (${commands.length}):\n`));

        // Group by namespace
        const grouped = new Map<string, any[]>();
        for (const cmd of commands) {
            const ns = cmd.description.match(/\(([^)]+)\)/)?.[1] || cmd.type;
            if (!grouped.has(ns)) {
                grouped.set(ns, []);
            }
            grouped.get(ns)!.push(cmd);
        }

        for (const [namespace, cmds] of grouped) {
            console.log(chalk.bold(`\n${namespace}`));
            for (const cmd of cmds) {
                const params = cmd.frontmatter['argument-hint'] ? ` ${cmd.frontmatter['argument-hint']}` : '';
                console.log(`  /${cmd.name}${params}`);
                console.log(`    ${cmd.description.replace(/\s*\([^)]+\)/, '')}`);

                if (cmd.frontmatter['allowed-tools'] && cmd.frontmatter['allowed-tools'].length > 0) {
                    console.log(chalk.dim(`    Allowed tools: ${cmd.frontmatter['allowed-tools'].join(', ')}`));
                }
            }
        }
        console.log('');
    }

    private async handleCommandsCreate(name?: string): Promise<void> {
        const { CommandCreator } = await import('../commands/CommandCreator');
        const creator = new CommandCreator(this.commandManager);
        await creator.run(name);
        // Re-discover commands after creation
        await this.commandManager.discoverCommands();
    }

    private async handleCommandsValidate(): Promise<void> {
        const { validateCommands } = await import('../commands/CommandCreator');
        await validateCommands(this.commandManager);
    }

    /**
     * Handle write_file approval with diff preview
     */
    private async handleWriteApproval(filePath: string, content: string): Promise<boolean> {
        // Check if file exists and show diff
        const fullPath = path.resolve(filePath);
        if (fs.existsSync(fullPath)) {
            const oldContent = fs.readFileSync(fullPath, 'utf-8');
            DiffViewer.showDiff(filePath, oldContent, content);
        } else {
            console.log('');
            console.log(chalk.cyan(`📄 Creating new file: ${filePath}`));
            console.log(chalk.dim('─'.repeat(60)));
            console.log(chalk.green('New file content:'));
            const preview = content.split('\n').slice(0, 10).join('\n');
            console.log(chalk.dim(preview));
            if (content.split('\n').length > 10) {
                console.log(chalk.dim('...'));
            }
            console.log(chalk.dim('─'.repeat(60)));
        }

        const { confirm } = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'confirm',
                message: `Allow writing to ${chalk.yellow(filePath)}?`,
                default: true
            }
        ]);

        return confirm;
    }

    /**
     * Handle edit_file approval with diff preview
     */
    private async handleEditApproval(args: { file_path: string; old_string: string; new_string: string }): Promise<boolean> {
        // Get diff from EditFileTool (which shows preview)
        const editTool = this.tools.find(t => t.name === 'edit_file') as any;
        if (editTool) {
            const diffResult = await editTool.execute(args);
            console.log(diffResult);
        }

        const { confirm } = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'confirm',
                message: `Apply edit to ${chalk.yellow(args.file_path)}?`,
                default: true
            }
        ]);

        return confirm;
    }

    /**
     * Handle read_file approval (currently auto-approves, but can be enhanced)
     */
    private async handleReadApproval(filePath: string): Promise<boolean> {
        // For now, auto-approve single file reads
        // In the future, could batch multiple reads into a single selector
        return true;
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