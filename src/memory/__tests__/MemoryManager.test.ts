import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { MemoryManager } from '../MemoryManager';
import { ChatMessage } from '../../llm/ModelInterface';

describe('MemoryManager', () => {
    let tempDir: string;
    let manager: MemoryManager;

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mentis-memory-'));
        manager = new MemoryManager({
            globalPath: path.join(tempDir, 'global.json'),
            projectPath: path.join(tempDir, 'project.json'),
            maxEntriesPerScope: 2,
        });
    });

    afterEach(() => fs.removeSync(tempDir));

    it('normalizes duplicate keys and reports updates', () => {
        expect(manager.set('  Preferred   Language ', ' TypeScript ', 'global')).toEqual({ added: 1, updated: 0, skipped: 0 });
        expect(manager.set('preferred language', 'Rust', 'global')).toEqual({ added: 0, updated: 1, skipped: 0 });

        expect(manager.getGlobal()).toHaveLength(1);
        expect(manager.getGlobal()[0]).toMatchObject({ key: 'preferred language', value: 'Rust' });
    });

    it('rejects malformed facts and bounds each memory tier', () => {
        const result = manager.merge([
            { key: '', value: 'ignored', scope: 'global' },
            { key: 'one', value: '1', scope: 'global' },
            { key: 'two', value: '2', scope: 'global' },
            { key: 'three', value: '3', scope: 'global' },
        ]);

        expect(result).toEqual({ added: 3, updated: 0, skipped: 1 });
        expect(manager.getGlobal().map(entry => entry.key)).toEqual(['two', 'three']);
    });

    it('lets project facts shadow global facts in the injected prompt', () => {
        manager.set('test command', 'npm test', 'global');
        manager.set('Test Command', 'bun test', 'project');

        const prompt = manager.buildPromptBlock();

        expect(prompt).toContain('bun test');
        expect(prompt).not.toContain('npm test');
        expect(prompt).toContain('untrusted factual notes');
    });

    it('deletes keys using normalized matching', () => {
        manager.set('Code Style', 'strict', 'project');

        expect(manager.delete(' code   style ', 'project')).toBe(true);
        expect(manager.delete('code style', 'project')).toBe(false);
    });

    it('includes a prior compaction summary and bounded recent turns for extraction', () => {
        const history: ChatMessage[] = [
            { role: 'system', content: '[Previous Conversation Summary]\nDecision: use SQLite.' },
            { role: 'user', content: 'old user' },
            { role: 'assistant', content: 'old assistant' },
            { role: 'user', content: 'recent user' },
            { role: 'assistant', content: 'recent assistant' },
        ];

        const conversation = MemoryManager.conversationForExtraction(history, 2);

        expect(conversation).toContain('Decision: use SQLite.');
        expect(conversation).toContain('recent user');
        expect(conversation).toContain('recent assistant');
        expect(conversation).not.toContain('old user');
    });
});
