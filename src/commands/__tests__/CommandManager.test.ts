/**
 * Tests for CommandManager
 */

import { CommandManager } from '../CommandManager';
import { Command } from '../Command';

describe('CommandManager', () => {
    let manager: CommandManager;

    beforeEach(() => {
        manager = new CommandManager();
    });

    describe('getAllCommands', () => {
        it('should return empty array initially', () => {
            const commands = manager.getAllCommands();
            expect(commands).toEqual([]);
        });
    });

    describe('getCommandsContext', () => {
        it('should return empty string when no commands', () => {
            const context = manager.getCommandsContext();
            expect(context).toBe('');
        });
    });

    describe('parseCommand', () => {
        it('should replace $ARGUMENTS placeholder', async () => {
            const command: Command = {
                name: 'echo',
                type: 'personal',
                path: '/echo.md',
                directory: '/commands',
                description: 'Echo arguments',
                frontmatter: {},
                content: 'You said: $ARGUMENTS',
                hasParameters: true
            };

            const parsed = await manager.parseCommand(command, ['hello', 'world']);

            expect(parsed.content).toContain('hello world');
        });

        it('should replace $1, $2 placeholders', async () => {
            const command: Command = {
                name: 'greet',
                type: 'personal',
                path: '/greet.md',
                directory: '/commands',
                description: 'Greet user',
                frontmatter: {},
                content: 'Hello $1, welcome to $2',
                hasParameters: true
            };

            const parsed = await manager.parseCommand(command, ['Alice', 'Wonderland']);

            expect(parsed.content).toContain('Hello Alice');
            expect(parsed.content).toContain('welcome to Wonderland');
        });

        it('should extract bash commands from content', async () => {
            const command: Command = {
                name: 'run-test',
                type: 'personal',
                path: '/run-test.md',
                directory: '/commands',
                description: 'Run tests',
                frontmatter: {},
                content: 'Run tests with !`npm test`',
                hasParameters: false
            };

            const parsed = await manager.parseCommand(command, []);

            expect(parsed.bashCommands).toHaveLength(1);
            expect(parsed.bashCommands[0]).toBe('npm test');
        });
    });
});
