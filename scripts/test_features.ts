import { WebSearchTool } from '../src/tools/WebSearchTool';
import { RepoMapper } from '../src/context/RepoMapper';
import chalk from 'chalk';
import path from 'path';

async function runTests() {
    console.log(chalk.cyan('🧪 Starting Feature Tests...\n'));

    // --- Test 1: Web Search ---
    console.log(chalk.yellow('1. Testing Web Search Tool...'));
    const webTool = new WebSearchTool();
    try {
        const result = await webTool.execute({ query: 'nodejs latest version' });
        if (result.includes('Node.js') || result.includes('v')) {
            console.log(chalk.green('✅ Web Search Success!'));
            console.log(chalk.dim(result.substring(0, 150) + '...'));
        } else {
            console.log(chalk.red('❌ Web Search returned unexpected results.'));
            console.log(result);
        }
    } catch (e: any) {
        console.log(chalk.red(`❌ Web Search Failed: ${e.message}`));
    }
    console.log('');

    // --- Test 2: Repo Mapper ---
    console.log(chalk.yellow('2. Testing Repo Mapper...'));
    try {
        const mapper = new RepoMapper(process.cwd());
        const tree = mapper.generateTree();

        if (tree.includes('src/') && tree.includes('package.json')) {
            console.log(chalk.green('✅ Repo Map Success!'));
            console.log(chalk.dim('Tree preview:'));
            const preview = tree.split('\n').slice(0, 10).join('\n');
            console.log(preview);
        } else {
            console.log(chalk.red('❌ Repo Map expected src/ and package.json but got:'));
            console.log(tree);
        }
    } catch (e: any) {
        console.log(chalk.red(`❌ Repo Map Failed: ${e.message}`));
    }

    console.log(chalk.cyan('\n🏁 Tests Completed.'));
}

runTests();
