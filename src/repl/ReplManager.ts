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

