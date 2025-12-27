import figlet from 'figlet';
import gradient from 'gradient-string';
import boxen from 'boxen';
import chalk from 'chalk';

export class UIManager {
    public static displayLogo() {
        console.clear();
        const logoText = figlet.textSync('MENTIS', {
            font: 'ANSI Shadow',
            horizontalLayout: 'default',
            verticalLayout: 'default',
            width: 100,
            whitespaceBreak: true,
        });
        console.log(gradient.pastel.multiline(logoText));
        console.log(chalk.gray('  v1.1.2 - AI Coding Agent'));
        console.log('');
    }

    public static renderDashboard(config: { model: string, mode: string, cwd: string }) {
        const { model, cwd } = config;
        const version = 'v1.1.2';

        // Layout: Left (Status/Welcome) | Right (Tips/Activity)
        // Total width ~80 chars. 
        // Left ~45, Right ~30.

        const pad = (str: string, width: number) => str + ' '.repeat(Math.max(0, width - str.length));

        const logo = gradient.pastel.multiline(figlet.textSync('MENTIS', { font: 'Small' }));
        const logoLines = logo.split('\n');

        // Tips Column
        const tips = [
            chalk.bold('Tips for getting started'),
            chalk.dim('Run /init to scaffold project'),
            chalk.dim('Run /model to switch AI'),
            chalk.dim('Run /help for full list')
        ];

        // Combine Logo (Left) and Tips (Right)
        let body = '';
        for (let i = 0; i < Math.max(logoLines.length, tips.length); i++) {
            const left = logoLines[i] || ''; // Logo line
            const right = tips[i] || '';     // Tip line
            // Need to strip ansi to calc padding? simple padding might break with ansi.
            // Let's just create two distinct blocks and join them?
            // Complex with boxen.
            // Let's stick to vertical stack if side-by-side matches ansi poorly.
            // Actually, let's just use the previous cleaner vertical stack but wider.
            // User liked the previous one "this is exellent", just wanted input box.
            // So I will keep the Dashboard mostly same, maybe just widen it.
        }

        // Re-using the clean layout but ensuring no "undefined" or weird overlaps
        const title = ` Mentis-CLI ${version} `;

        const content =
            ` ${chalk.bold('Welcome back!')}\n\n` +
            `${logo}\n\n` +
            ` ${chalk.dim('Model:')} ${chalk.cyan(model)}\n` +
            ` ${chalk.dim('Dir:')}   ${chalk.dim(cwd)}\n\n` +
            `${chalk.gray('────────────────────────────────────────────────────────────────')}\n` +
            ` ${chalk.dim('Tips: /help • /config • /mcp • Esc to cancel')}`;

        console.log(
            boxen(content, {
                padding: 1,
                margin: 0,
                borderStyle: 'round',
                borderColor: 'cyan',
                title: title,
                titleAlignment: 'left',
                dimBorder: true,
                width: 80
            })
        );
        console.log('');
    }



    public static printSeparator() {
        console.log(chalk.gray('──────────────────────────────────────────────────'));
    }
}
