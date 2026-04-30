import fs from 'fs-extra';
import path from 'path';
import os from 'os';

interface MentisConfig {
    defaultProvider: string;
    openai?: {
        apiKey?: string;
        baseUrl?: string;
        model?: string;
    };
    ollama?: {
        baseUrl?: string;
        model?: string;
    };
    gemini?: {
        apiKey?: string;
        model?: string;
    };
    glm?: {
        apiKey?: string;
        model?: string; // e.g. glm-4
        baseUrl?: string;
    };
    anthropic?: {
        apiKey?: string;
        model?: string;
    };
    telegram?: {
        botToken?: string;
        allowedChatIds?: string;
        autoApprove?: boolean;
    };
    autoApprove?: boolean;   // persist --yolo across sessions
    searchKeys?: {
        tavilyApiKey?: string;
        serperApiKey?: string;
    };
}

export class ConfigManager {
    private configPath: string;
    private config: MentisConfig;

    constructor() {
        this.configPath = path.join(os.homedir(), '.mentisrc');
        this.config = {
            defaultProvider: 'ollama',
            ollama: {
                baseUrl: 'http://localhost:11434/v1',
                model: 'llama3:latest'
            },
            gemini: {
                model: 'gemini-2.5-flash'
            },
            glm: {
                model: 'glm-4.6',
            },
        };
        this.loadConfig();
    }

    private loadConfig() {
        try {
            if (fs.existsSync(this.configPath)) {
                const fileContent = fs.readFileSync(this.configPath, 'utf-8');
                this.config = { ...this.config, ...JSON.parse(fileContent) };
            }
        } catch (error) {
            console.error('Error loading config:', error);
        }
        this.applySearchKeys();
    }

    private applySearchKeys() {
        const keys = this.config.searchKeys;
        if (!keys) return;
        if (keys.tavilyApiKey && !process.env.TAVILY_API_KEY) process.env.TAVILY_API_KEY = keys.tavilyApiKey;
        if (keys.serperApiKey && !process.env.SERPER_API_KEY) process.env.SERPER_API_KEY = keys.serperApiKey;
    }

    public saveConfig() {
        try {
            fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
        } catch (error) {
            console.error('Error saving config:', error);
        }
    }

    public getConfig(): MentisConfig {
        return this.config;
    }

    public reloadConfig() {
        this.loadConfig();
    }

    public updateConfig(newConfig: Partial<MentisConfig>) {
        this.config = { ...this.config, ...newConfig };
        this.saveConfig();
    }
}
