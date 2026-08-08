import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { EffortLevel, Provider } from '../llm/ModelCatalog';

export interface ProviderConfig {
    apiKey?: string;
    baseUrl?: string;
    model?: string;
    effort?: EffortLevel;
}

export interface MentisConfig {
    defaultProvider: Provider;
    anthropic?: ProviderConfig;
    openai?: {
        apiKey?: string;
        baseUrl?: string;
        model?: string;
        effort?: EffortLevel;
    };
    ollama?: {
        baseUrl?: string;
        model?: string;
        effort?: EffortLevel;
    };
    gemini?: {
        apiKey?: string;
        model?: string;
        effort?: EffortLevel;
    };
    glm?: {
        apiKey?: string;
        model?: string; // e.g. glm-4
        baseUrl?: string;
        effort?: EffortLevel;
    };

}

export class ConfigManager {
    private configPath: string;
    private config: MentisConfig;

    constructor() {
        this.configPath = path.join(os.homedir(), '.mentisrc');
        this.config = {
            defaultProvider: 'ollama',
            anthropic: {
                model: 'claude-sonnet-5',
                effort: 'high',
            },
            openai: {
                baseUrl: 'https://api.openai.com/v1',
                model: 'gpt-5.6-terra',
                effort: 'medium',
            },
            ollama: {
                baseUrl: 'http://localhost:11434/v1',
                model: 'llama3:latest'
            },
            gemini: {
                model: 'gemini-3.6-flash',
                effort: 'medium',
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
                const stored = JSON.parse(fileContent) as Partial<MentisConfig>;
                this.config = {
                    ...this.config,
                    ...stored,
                    anthropic: { ...this.config.anthropic, ...stored.anthropic },
                    openai: { ...this.config.openai, ...stored.openai },
                    ollama: { ...this.config.ollama, ...stored.ollama },
                    gemini: { ...this.config.gemini, ...stored.gemini },
                    glm: { ...this.config.glm, ...stored.glm },
                };
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
