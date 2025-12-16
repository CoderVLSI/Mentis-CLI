import { ConfigManager } from '../src/config/ConfigManager';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import os from 'os';

async function testConfig() {
    console.log(chalk.cyan('🧪 Testing ConfigManager...'));

    const configManager = new ConfigManager();
    const initialConfig = configManager.getConfig();
    console.log('Initial Config:', initialConfig);

    // 1. Test updating active provider
    console.log(chalk.yellow('\n1. Setting active provider to "gemini"'));
    configManager.updateConfig({ defaultProvider: 'gemini' });

    let currentConfig = configManager.getConfig();
    if (currentConfig.defaultProvider === 'gemini') {
        console.log(chalk.green('✅ Provider set successfully.'));
    } else {
        console.log(chalk.red(`❌ Failed to set provider. Got: ${currentConfig.defaultProvider}`));
    }

    // 2. Test updating model for a provider
    console.log(chalk.yellow('\n2. Updating Model for "gemini"'));
    const newModel = 'gemini-1.5-pro-test';

    const updates: any = {};
    updates['gemini'] = { ...(currentConfig.gemini || {}), model: newModel };
    configManager.updateConfig(updates);

    currentConfig = configManager.getConfig();
    if (currentConfig.gemini?.model === newModel) {
        console.log(chalk.green(`✅ Model updated successfully to ${newModel}`));
    } else {
        console.log(chalk.red(`❌ Failed to update model. Got: ${currentConfig.gemini?.model}`));
    }

    // 3. Test API Key update
    console.log(chalk.yellow('\n3. Updating API Key for "gemini"'));
    const newKey = 'test-key-123';

    updates['gemini'] = { ...(currentConfig.gemini || {}), apiKey: newKey };
    configManager.updateConfig(updates); // Should merge with model update from previous step effectively if we pull fresh?
    // Actually our test logic pulled currentConfig above, so it preserves 'model'.

    currentConfig = configManager.getConfig();
    if (currentConfig.gemini?.apiKey === newKey && currentConfig.gemini?.model === newModel) {
        console.log(chalk.green('✅ API Key updated successfully (and model preserved).'));
    } else {
        console.log(chalk.red('❌ Failed to update API Key or verify persistence.'));
        console.log(currentConfig.gemini);
    }

    // Restore original config to be nice
    console.log(chalk.yellow('\nRestoring original config (defaultProvider)...'));
    configManager.updateConfig({ defaultProvider: initialConfig.defaultProvider });

    console.log(chalk.cyan('\n🏁 Config Tests Completed.'));
}

testConfig();
