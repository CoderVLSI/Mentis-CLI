import fs from 'fs-extra';
import path from 'path';

export class RepoMapper {
    private rootDir: string;
    private ignorePatterns: Set<string>;

    constructor(rootDir: string) {
        this.rootDir = rootDir;
        this.ignorePatterns = new Set(['.git', 'node_modules', 'dist', 'coverage', '.DS_Store']);
    }

    public generateTree(): string {
        return this.walk(this.rootDir, '');
    }

    private walk(currentPath: string, indent: string): string {
        try {
            const files = fs.readdirSync(currentPath);
            let result = '';

            // Sort: Directories first, then files
            files.sort((a, b) => {
                const aPath = path.join(currentPath, a);
                const bPath = path.join(currentPath, b);
                const aIsDir = fs.statSync(aPath).isDirectory();
                const bIsDir = fs.statSync(bPath).isDirectory();
                if (aIsDir && !bIsDir) return -1;
                if (!aIsDir && bIsDir) return 1;
                return a.localeCompare(b);
            });

            const filteredFiles = files.filter(f => !this.ignorePatterns.has(f));

            filteredFiles.forEach((file, index) => {
                const isLast = index === filteredFiles.length - 1;
                const filePath = path.join(currentPath, file);
                const isDir = fs.statSync(filePath).isDirectory();

                const prefix = isLast ? '└── ' : '├── ';
                const childIndent = isLast ? '    ' : '│   ';

                result += `${indent}${prefix}${file}${isDir ? '/' : ''}\n`;

                if (isDir) {
                    result += this.walk(filePath, indent + childIndent);
                }
            });

            return result;
        } catch (e) {
            return `${indent}Error reading directory: ${e}\n`;
        }
    }
}
