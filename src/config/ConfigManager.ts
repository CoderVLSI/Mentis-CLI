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
    anthropic?: {
        apiKey?: string;
        model?: string;
    };
    groq?: {
        apiKey?: string;
        model?: string;
    };
    openrouter?: {
        apiKey?: string;
        model?: string;
    };
    llamacpp?: {
        baseUrl?: string;
        model?: string;
        apiKey?: string;
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
            anthropic: {
                model: 'claude-3-opus-20240229'
            },
            groq: {
                model: 'llama3-70b-8192'
            },
            openrouter: {
                model: 'anthropic/claude-3-opus' // Example
            },
            llamacpp: {
                baseUrl: 'http://localhost:8080/v1',
                model: 'default' // Llama.cpp often ignores model name if only one is loaded, but typical to send something
            }
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

    public updateConfig(newConfig: Partial<MentisConfig>) {
        this.config = { ...this.config, ...newConfig };
        this.saveConfig();
    }
}
