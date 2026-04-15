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
import { InstructionsLoader } from '../utils/InstructionsLoader';

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
    private instructionsLoader: InstructionsLoader;
    private projectInstructions: string = '';

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
        this.instructionsLoader = new InstructionsLoader();
        this.projectInstructions = this.instructionsLoader.load();
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
        if (!this.instructionsLoader.hasInstructions()) {
            console.log(chalk.dim('  Tip: Run /init to create a .mentis.md project instructions file.'));
        }
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
                console.log(chalk.green(`\n\u2713 Resumed ${source} session from ${new Date(cp.timestamp).toLocaleString()}`));
                console.log(chalk.dim(`  Messages: ${this.history.length}\n`));
            } else {
                console.log(chalk.yellow('\n\u26a0 No previous session found to resume.\n'));
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
                console.log(chalk.green('\n\u2713 Context cleared\n'));
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

        // Inject .mentis.md project instructions (like CLAUDE.md in Claude Code)
        if (this.projectInstructions) {
            fullInput = `${this.projectInstructions}\n\n${fullInput}`;
        }

        this.history.push({ role: 'user', content: fullInput });