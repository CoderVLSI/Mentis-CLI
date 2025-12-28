/**
 * Tests for SkillsManager
 */

import { SkillsManager } from '../SkillsManager';
import { Skill } from '../Skill';

describe('SkillsManager', () => {
    let manager: SkillsManager;

    beforeEach(() => {
        manager = new SkillsManager();
    });

    describe('getAllSkills', () => {
        it('should return empty array initially', () => {
            const skills = manager.getAllSkills();
            expect(skills).toEqual([]);
        });
    });

    describe('getSkill', () => {
        it('should return undefined for non-existent skill', () => {
            const skill = manager.getSkill('non-existent');
            expect(skill).toBeUndefined();
        });
    });

    describe('getSkillsContext', () => {
        it('should return empty string when no skills', () => {
            const context = manager.getSkillsContext();
            expect(context).toBe('');
        });
    });

    describe('addSkill', () => {
        it('should add skill to manager', () => {
            const skill: Skill = {
                name: 'test-skill',
                description: 'Test skill',
                path: '/skills/test.md',
                type: 'personal',
                directory: '/skills',
                isValid: true,
                content: 'Test content'
            };

            manager['skills'].set('test-skill', skill);
            const retrieved = manager.getSkill('test-skill');

            expect(retrieved).toBeDefined();
            expect(retrieved?.name).toBe('test-skill');
        });

        it('should return skills context with skills', () => {
            const skill: Skill = {
                name: 'reviewer',
                description: 'Code reviewer skill',
                path: '/skills/reviewer.md',
                type: 'personal',
                directory: '/skills',
                isValid: true,
                content: 'Review code'
            };

            manager['skills'].set('reviewer', skill);
            const context = manager.getSkillsContext();

            expect(context).toContain('Available Skills');
            expect(context).toContain('reviewer');
        });
    });
});
