import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { SettingsManager } from '../SettingsManager';

describe('SettingsManager context settings', () => {
    let tempDir: string;

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mentis-settings-'));
    });

    afterEach(() => fs.removeSync(tempDir));

    it('uses safe context defaults', () => {
        const settings = new SettingsManager(tempDir).getContextSettings();

        expect(settings).toEqual({
            autoCompact: true,
            compactAtPercent: 80,
            forceCompactAtPercent: 95,
            keepRecentTurns: 4,
        });
    });

    it('clamps invalid thresholds and preserves prompt mode', () => {
        fs.ensureDirSync(path.join(tempDir, '.mentis'));
        fs.writeJsonSync(path.join(tempDir, '.mentis', 'settings.json'), {
            context: {
                autoCompact: false,
                compactAtPercent: 20,
                forceCompactAtPercent: 10,
                keepRecentTurns: 100,
            },
        });

        expect(new SettingsManager(tempDir).getContextSettings()).toEqual({
            autoCompact: false,
            compactAtPercent: 50,
            forceCompactAtPercent: 50,
            keepRecentTurns: 20,
        });
    });
});
