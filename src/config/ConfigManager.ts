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
                model: 'glm-4'
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
