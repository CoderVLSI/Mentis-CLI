import { Tool } from './Tool';
import { search } from 'duck-duck-scrape';
import chalk from 'chalk';

export class WebSearchTool implements Tool {
    name = 'search_web';
    description = 'Search the internet for documentation, libraries, or solutions to errors. Returns snippets of top results.';
    parameters = {
        type: 'object',
        properties: {
            query: {
                type: 'string',
                description: 'The search query.'
            }
        },
        required: ['query']
    };

    async execute(args: { query: string }): Promise<string> {
        try {
            // Priority 1: Google Search
            try {
                // Dynamic import to avoid build issues if types are missing
                const { search: googleSearch } = require('google-sr');
                console.log(chalk.dim(`  Searching Google for: "${args.query}"...`));

                const googleResults: any[] = await googleSearch({
                    query: args.query,
                    limit: 5,
                });

                if (googleResults && googleResults.length > 0) {
                    const formatted = googleResults.map(r =>
                        `[${r.title}](${r.link})\n${r.description || 'No description.'}`
                    ).join('\n\n');
                    return `Top Google Results:\n\n${formatted}`;
                }
            } catch (googleError: any) {
                console.log(chalk.dim(`  Google search failed (${googleError.message}), failing over to DuckDuckGo...`));
            }

            // Priority 2: DuckDuckGo Fallback
            console.log(chalk.dim(`  Searching DuckDuckGo for: "${args.query}"...`));
            const ddgResults = await search(args.query, {
                safeSearch: 0
            });

            if (!ddgResults.results || ddgResults.results.length === 0) {
                return 'No results found.';
            }

            // Return top 5 results
            const topResults = ddgResults.results.slice(0, 5).map(r =>
                `[${r.title}](${r.url})\n${r.description || 'No description found.'}`
            ).join('\n\n');

            return `Top Search Results (via DDG):\n\n${topResults}`;

        } catch (error: any) {
            return `Error searching web: ${error.message}`;
        }
    }
}
