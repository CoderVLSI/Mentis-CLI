import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';

const execAsync = promisify(exec);

export class UpdateManager {
    private packageName: string;
    private currentVersion: string;

    constructor() {
        const packageJsonPath = path.join(__dirname, '../../package.json');
        try {
            const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
            this.packageName = packageJson.name;
            this.currentVersion = packageJson.version;
        } catch (e) {
            // Fallback if running from a context where package.json isn't found easily (e.g. global install oddities)
            // But usually this works relative to dist/utils/
            this.packageName = '@indiccoder/mentis-cli';
            this.currentVersion = '0.0.0';
        }
    }

    public async checkAndPerformUpdate(interactive: boolean = true) {
        const spinner = ora('Checking for updates...').start();

        try {
            // Check latest version from NPM registry
            const { stdout } = await execAsync(`npm view ${this.packageName} version`);
            const latestVersion = stdout.trim();

            if (latestVersion === this.currentVersion) {
                spinner.succeed(chalk.green(`You are on the latest version (${this.currentVersion}).`));
                return;
            }

            spinner.info(chalk.blue(`Update available: ${this.currentVersion} -> ${chalk.bold(latestVersion)}`));

            if (!interactive) {
                // If running in non-interactive mode (e.g. auto-check prompt), maybe just log it.
                // But for explicit 'update' command, we usually assume interactive or force.
                console.log(chalk.yellow(`Run 'mentis update' or '/update' inside the tool to upgrade.`));
                return;
            }

            const { confirm } = await inquirer.prompt([{
                type: 'confirm',
                name: 'confirm',
                message: `Do you want to install v${latestVersion} now?`,
                default: true
            }]);

            if (confirm) {
                await this.installUpdate(latestVersion);
            } else {
                console.log(chalk.yellow('Update skipped.'));
            }

        } catch (error: any) {
            spinner.fail(chalk.red('Failed to check for updates.'));
            if (process.env.DEBUG) console.error(error);
        }
    }

    private async installUpdate(version: string) {
        const spinner = ora(`Installing ${this.packageName}@${version}...`).start();
        try {
            await execAsync(`npm install -g ${this.packageName}@latest`);
            spinner.succeed(chalk.green('Update completed successfully!'));
            console.log(chalk.cyan('Please restart Mentis to use the new version.'));
            process.exit(0);
        } catch (error: any) {
            spinner.fail(chalk.red('Update failed.'));
            console.error(chalk.red('Error details:'), error.message);
            console.log(chalk.yellow(`Try running: npm install -g ${this.packageName}@latest`));
        }
    }
}
