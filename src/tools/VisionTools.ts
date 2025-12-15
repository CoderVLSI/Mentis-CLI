import { Tool } from './Tool';
const screenshot = require('screenshot-desktop');
import path from 'path';
import fs from 'fs-extra';
import { v4 as uuidv4 } from 'uuid';

export class ScreenshotTool implements Tool {
    name = 'take_screenshot';
    description = 'Capture a screenshot of all displays and save it to a file.';
    parameters = {
        type: 'object',
        properties: {
            outputDir: {
                type: 'string',
                description: 'Optional directory to save the screenshot. Defaults to current working directory.'
            }
        }
    };

    async execute(args: { outputDir?: string }): Promise<string> {
        try {
            const dir = args.outputDir || process.cwd();
            await fs.ensureDir(dir);

            const filename = `screenshot_${Date.now()}_${uuidv4().substring(0, 4)}.png`;
            const filepath = path.join(dir, filename);

            await screenshot({ filename: filepath });
            return `Screenshot saved to: ${filepath}`;
        } catch (error: any) {
            return `Error taking screenshot: ${error.message}`;
        }
    }
}
