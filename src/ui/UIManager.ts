import figlet from 'figlet';
import gradient from 'gradient-string';
import boxen from 'boxen';
import chalk from 'chalk';

export class UIManager {
    public static displayLogo() {
        console.clear();
        const logoText = figlet.textSync('MENTIS', {
            font: 'ANSI Shadow', // Use a block-like font
            horizontalLayout: 'default',
            verticalLayout: 'default',
            width: 100,
            whitespaceBreak: true,
        });
        console.log(gradient.pastel.multiline(logoText));
        console.log(chalk.gray('  v1.0.0 - AI Coding Agent'));
        console.log('');
    }

    public static displayWelcome() {
        console.log(
            boxen(
                `${chalk.bold('Welcome to Mentis-CLI')}\n\n` +
                `• Type ${chalk.cyan('/help')} for commands.\n` +
                `• Type ${chalk.cyan('/config')} to setup your model.\n` +
                `• Start typing to chat with your agent.`,
                {
                    padding: 1,
                    margin: 1,
                    borderStyle: 'round',
                    borderColor: 'cyan',
                }
            )
        );
    }

    public static printSeparator() {
        console.log(chalk.gray('──────────────────────────────────────────────────'));
    }
}
