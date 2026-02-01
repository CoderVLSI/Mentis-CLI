import { Tool } from './Tool';
import chalk from 'chalk';
import { exec } from 'child_process';
import os from 'os';

export class WebSearchTool implements Tool {
    name = 'search_web';
    description = 'Search internet for documentation, libraries, or solutions to errors. Returns snippets of top results.';
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

    /**
     * Execute search using a hybrid strategy:
     * 1. Tavily API (if configured) - Most Reliable
     * 2. NPM/Expo Registry (if applicable) - Bypasses search engines
     * 3. Google Curl - Mimics browser request
     * 4. DuckDuckGo Lite - Low bandwidth fallback
     * 5. DuckDuckScrape Library - Last resort
     */
    async execute(args: { query: string }): Promise<string> {
        // 1. Try API Key (Most Reliable)
        if (process.env.TAVILY_API_KEY) {
            try {
                return await this.searchTavily(args.query, process.env.TAVILY_API_KEY);
            } catch (e) {
                console.error(chalk.red('Tavily search failed, falling back to scraper.'));
            }
        }

        // 2. Specific Fallback: NPM/Expo Queries (Bypass Search Engines)
        // If user asks for versions, use npm directly
        if (args.query.toLowerCase().includes('expo') || args.query.toLowerCase().includes('react native')) {
            try {
                const npmInfo = await this.checkNpmVersion('expo');
                if (npmInfo) {
                    return `NPM Registry Info:\n${npmInfo}\n\n(Web search was blocked, but I checked NPM directly.)`;
                }
            } catch (e) {
                // Ignore npm error
            }
        }

        // Rate limit protection
        await new Promise(resolve => setTimeout(resolve, 2000));

        try {
            // Strategy 1: Google Curl (Specific Browser Header)
            try {
                const googleResults = await this.searchGoogleCurl(args.query);
                if (googleResults.length > 0) return this.formatResults(googleResults, 'Google');
            } catch (e) {
                // Ignore
            }

            // Strategy 2: DDG Lite
            try {
                const liteResults = await this.searchDuckDuckGoLite(args.query);
                if (liteResults.length > 0) return this.formatResults(liteResults, 'DDG Lite');
            } catch (e) {
                // Ignore
            }

            // Strategy 3: Library Fallback
            console.log(chalk.dim(`  Direct scraping failed, falling back to library...`));
            const { search } = require('duck-duck-scrape');
            const ddgResults = await search(args.query, { safeSearch: 0 });

            if (!ddgResults.results?.length) throw new Error('No results from library');

            return `Top Search Results (Library):\n\n` +
                ddgResults.results.slice(0, 5).map((r: any) =>
                    `[${r.title}](${r.url})\n${r.description || 'No description found.'}`
                ).join('\n\n');

        } catch (error: any) {
            return `Web Search Failed (CAPTCHA Blocked).

Search engines are blocking automated requests from your network.

To enable web search, get a free Tavily API key:
  1. Go to https://tavily.com
  2. Sign up for free
  3. Add to your .env: TAVILY_API_KEY=your_key_here

Alternatively, use Exa via MCP:
  1. Get key at https://exa.ai
  2. Add EXA_API_KEY to .env
  3. Run: /mcp connect "Exa Search"`;
        }
    }

    private formatResults(results: any[], source: string): string {
        const formatted = results.slice(0, 5).map(r =>
            `[${r.title}](${r.url})\n${r.snippet || 'No description.'}`
        ).join('\n\n');
        return `Top Search Results (${source}):\n\n${formatted}`;
    }

    private async searchTavily(query: string, apiKey: string): Promise<string> {
        console.log(chalk.dim(`  Searching Tavily for: "${query}"...`));
        try {
            const response = await fetch("https://api.tavily.com/search", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ api_key: apiKey, query, search_depth: "basic", include_answer: true })
            });
            const data = await response.json() as any;
            const results = data.results.map((r: any) => `[${r.title}](${r.url})\n${r.content}`).join('\n\n');
            return `Tavily Results:\n\n${results}`;
        } catch (e: any) {
            throw new Error(`Tavily Error: ${e.message}`);
        }
    }

    private async checkNpmVersion(pkg: string): Promise<string> {
        return new Promise((resolve) => {
            exec(`npm view ${pkg} name version dist-tags --json`, { maxBuffer: 1024 * 1024 }, (error, stdout) => {
                if (error || !stdout) resolve('');
                try {
                    const info = JSON.parse(stdout);
                    resolve(`Package: ${info.name}\nLatest Version: ${info.version}\nTags: ${JSON.stringify(info['dist-tags'])}`);
                } catch { resolve('') }
            });
        });
    }

    private async searchGoogleCurl(query: string): Promise<Array<{ title: string, url: string, snippet: string }>> {
        console.log(chalk.dim(`  Searching Google (Curl) for: "${query}"...`));
        const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&hl=en`;
        const userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

        // Use curl.exe explicitly on Windows
        const curlCmd = os.platform() === 'win32' ? 'curl.exe' : 'curl';

        return new Promise((resolve, reject) => {
            exec(`${curlCmd} -s -L -A "${userAgent}" "${url}"`, { maxBuffer: 1024 * 1024 * 2 }, (error, stdout) => {
                if (error) {
                    reject(error);
                    return;
                }

                const html = stdout;
                const results: Array<{ title: string, url: string, snippet: string }> = [];

                // Matches standard google result anchors: <a href="/url?q=..." ...><h3 ...>Title</h3>...
                const linkRegex = /<a href="\/url\?q=([^&]+)&amp;[^"]+">[^<]*<h3[^>]*><div[^>]*>([^<]+)<\/div><\/h3>/g;

                let match;
                while ((match = linkRegex.exec(html)) !== null) {
                    results.push({
                        url: decodeURIComponent(match[1]),
                        title: this.decodeHtml(match[2]),
                        snippet: ''
                    });
                }

                resolve(results);
            });
        });
    }

    private async curl(url: string): Promise<string> {
        const curl = os.platform() === 'win32' ? 'curl.exe' : 'curl';
        const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';

        return new Promise<string>((resolve, reject) => {
            exec(`${curl} -s -L -A "${userAgent}" "${url}"`, { maxBuffer: 1024 * 1024 * 2 }, (error, stdout, stderr) => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve(stdout);
            });
        });
    }

    private async searchDuckDuckGoHtml(query: string): Promise<Array<{ title: string, url: string, snippet: string }>> {
        console.log(chalk.dim(`  Searching DuckDuckGo (HTML) for: "${query}"...`));
        const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
        const html = await this.curl(url);

        const results: Array<{ title: string, url: string, snippet: string }> = [];
        const chunks = html.split('class="result__body"');

        for (let i = 1; i < chunks.length; i++) {
            const chunk = chunks[i];
            const titleMatch = chunk.match(/class="result__a" href="([^"]+)">(.*?)<\/a>/);
            const snippetMatch = chunk.match(/class="result__snippet"[^>]*>(.*?)<\/a>/);

            if (titleMatch) {
                results.push({
                    url: titleMatch[1],
                    title: this.decodeHtml(titleMatch[2].replace(/<[^>]+>/g, '').trim()),
                    snippet: snippetMatch ? this.decodeHtml(snippetMatch[1].replace(/<[^>]+>/g, '').trim()) : ''
                });
            }
        }
        return results;
    }

    private async searchDuckDuckGoLite(query: string): Promise<Array<{ title: string, url: string, snippet: string }>> {
        console.log(chalk.dim(`  Searching DuckDuckGo (Lite) for: "${query}"...`));
        const url = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`;
        const html = await this.curl(url);

        const results: Array<{ title: string, url: string, snippet: string }> = [];
        const regex = /<a[^>]+class="result-link"[^>]+href="(.*?)"[^>]*>(.*?)<\/a>/g;
        let match;
        while ((match = regex.exec(html)) !== null) {
            results.push({
                url: match[1],
                title: this.decodeHtml(match[2].replace(/<[^>]+>/g, '').trim()),
                snippet: 'Click to view.'
            });
        }
        return results;
    }

    private decodeHtml(str: string): string {
        return str
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'");
    }
}