import fs from 'fs-extra';
import path from 'path';
import { execSync } from 'child_process';

export class RepoMapper {
    private rootDir: string;
    private ignorePatterns: Set<string>;

    constructor(rootDir: string) {
        this.rootDir = rootDir;
        this.ignorePatterns = new Set(['.git', 'node_modules', 'dist', 'coverage', '.DS_Store']);
    }

    public generateTree(): string {
        try {
            // Try using git first for speed
            const stdout = execSync('git ls-files --cached --others --exclude-standard', {
                cwd: this.rootDir,
                encoding: 'utf-8',
                stdio: ['ignore', 'pipe', 'ignore'] // Ignore stderr to avoid noise
            });
            const files = stdout.split('\n').filter(Boolean);
            return this.buildTreeFromPaths(files);
        } catch (error) {
            // Fallback to manual walk if not a git repo or git fails
            return this.walk(this.rootDir, '');
        }
    }

    private buildTreeFromPaths(paths: string[]): string {
        const tree: any = {};

        // Build object tree
        for (const p of paths) {
            const parts = p.split('/');
            let current = tree;
            for (const part of parts) {
                if (!current[part]) {
                    current[part] = {};
                }
                current = current[part];
            }
        }

        // Convert object tree to string
        return this.renderTree(tree, '');
    }

    private renderTree(node: any, indent: string): string {
        let result = '';
        const keys = Object.keys(node).sort((a, b) => {
            const aIsLeaf = Object.keys(node[a]).length === 0;
            const bIsLeaf = Object.keys(node[b]).length === 0;
            // Dirs first
            if (!aIsLeaf && bIsLeaf) return -1;
            if (aIsLeaf && !bIsLeaf) return 1;
            return a.localeCompare(b);
        });

        keys.forEach((key, index) => {
            const isLast = index === keys.length - 1;
            const isDir = Object.keys(node[key]).length > 0;
            const prefix = isLast ? '└── ' : '├── ';
            const childIndent = isLast ? '    ' : '│   ';

            result += `${indent}${prefix}${key}${isDir ? '/' : ''}\n`;

            if (isDir) {
                result += this.renderTree(node[key], indent + childIndent);
            }
        });

        return result;
    }

    private walk(currentPath: string, indent: string): string {
        try {
            const files = fs.readdirSync(currentPath);
            let result = '';

            // Cache stats to avoid repeated calls during sort
            const fileStats = files.map(file => {
                try {
                    return {
                        name: file,
                        isDir: fs.statSync(path.join(currentPath, file)).isDirectory()
                    };
                } catch {
                    return null;
                }
            }).filter(f => f) as { name: string, isDir: boolean }[];

            // Sort: Directories first, then files
            fileStats.sort((a, b) => {
                if (a.isDir && !b.isDir) return -1;
                if (!a.isDir && b.isDir) return 1;
                return a.name.localeCompare(b.name);
            });

            const filteredFiles = fileStats.filter(f => !this.ignorePatterns.has(f.name));

            filteredFiles.forEach((fileObj, index) => {
                const isLast = index === filteredFiles.length - 1;
                const prefix = isLast ? '└── ' : '├── ';
                const childIndent = isLast ? '    ' : '│   ';

                result += `${indent}${prefix}${fileObj.name}${fileObj.isDir ? '/' : ''}\n`;

                if (fileObj.isDir) {
                    result += this.walk(path.join(currentPath, fileObj.name), indent + childIndent);
                }
            });

            return result;
        } catch (e) {
            return `${indent}Error reading directory: ${e}\n`;
        }
    }
}
