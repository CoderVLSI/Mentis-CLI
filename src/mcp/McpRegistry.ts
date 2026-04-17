/**
 * McpRegistry - Curated catalog of installable MCP servers
 *
 * Each entry maps a short slug → npm package + config.
 * Install flow: /mcp install <slug>
 *   1. Look up registry entry
 *   2. Write McpServerConfig to ~/.mentis/mcp.json (uses npx -y, no global install)
 *   3. Prompt for required env vars
 *   4. Optionally auto-connect
 */

export interface McpRegistryEntry {
    slug: string;           // Short name used in /mcp install <slug>
    name: string;           // Display name
    package: string;        // npm package name
    description: string;
    category: McpCategory;
    command: string;        // Usually 'npx'
    args: string[];         // e.g. ['-y', 'chrome-devtools-mcp']
    requiredEnv?: string[]; // Env vars the user must supply
    optionalEnv?: string[]; // Env vars that enhance functionality
    homepage?: string;
    tags?: string[];
}

export type McpCategory =
    | 'browser'
    | 'search'
    | 'productivity'
    | 'data'
    | 'devtools'
    | 'communication'
    | 'cloud';

export const MCP_REGISTRY: McpRegistryEntry[] = [
    // ── Browser ──────────────────────────────────────────────────────────────
    {
        slug: 'chrome-devtools',
        name: 'Chrome DevTools',
        package: 'chrome-devtools-mcp',
        description: 'Official Chrome DevTools MCP — browser control, JS eval, console logs, screenshots, Lighthouse, Web Vitals, network inspection. Auto-connects to running Chrome.',
        category: 'browser',
        command: 'npx',
        args: ['-y', 'chrome-devtools-mcp'],
        homepage: 'https://github.com/ChromeDevTools/chrome-devtools-mcp',
        tags: ['browser', 'debugging', 'devtools', 'lighthouse', 'performance'],
    },
    {
        slug: 'playwright',
        name: 'Playwright',
        package: '@playwright/mcp',
        description: 'Cross-browser automation via Playwright — navigate, click, fill forms, screenshot. Supports Chrome, Firefox, Safari, Edge.',
        category: 'browser',
        command: 'npx',
        args: ['-y', '@playwright/mcp'],
        homepage: 'https://github.com/microsoft/playwright-mcp',
        tags: ['browser', 'automation', 'testing', 'cross-browser'],
    },
    {
        slug: 'puppeteer',
        name: 'Puppeteer',
        package: '@modelcontextprotocol/server-puppeteer',
        description: 'Headless Chrome automation and scraping via Puppeteer.',
        category: 'browser',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-puppeteer'],
        tags: ['browser', 'scraping', 'automation'],
    },

    // ── Search ────────────────────────────────────────────────────────────────
    {
        slug: 'exa',
        name: 'Exa Search',
        package: '@exa-labs/mcp-server-exa',
        description: 'Neural web search via Exa — great for finding recent docs and code examples.',
        category: 'search',
        command: 'npx',
        args: ['-y', '@exa-labs/mcp-server-exa'],
        requiredEnv: ['EXA_API_KEY'],
        homepage: 'https://exa.ai',
        tags: ['search', 'web', 'research'],
    },
    {
        slug: 'brave-search',
        name: 'Brave Search',
        package: '@modelcontextprotocol/server-brave-search',
        description: 'Web search via Brave Search API.',
        category: 'search',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-brave-search'],
        requiredEnv: ['BRAVE_API_KEY'],
        tags: ['search', 'web'],
    },
    {
        slug: 'tavily',
        name: 'Tavily Search',
        package: 'tavily-mcp',
        description: 'AI-optimised web search via Tavily — returns clean summaries ideal for LLM context.',
        category: 'search',
        command: 'npx',
        args: ['-y', 'tavily-mcp'],
        requiredEnv: ['TAVILY_API_KEY'],
        homepage: 'https://tavily.com',
        tags: ['search', 'web', 'research'],
    },

    // ── DevTools ──────────────────────────────────────────────────────────────
    {
        slug: 'filesystem',
        name: 'Filesystem',
        package: '@modelcontextprotocol/server-filesystem',
        description: 'Enhanced filesystem operations — read, write, list, search files with sandboxed access.',
        category: 'devtools',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem', '.'],
        tags: ['files', 'filesystem'],
    },
    {
        slug: 'memory',
        name: 'Memory',
        package: '@modelcontextprotocol/server-memory',
        description: 'Persistent key-value memory store across sessions.',
        category: 'devtools',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-memory'],
        tags: ['memory', 'persistence'],
    },
    {
        slug: 'sequential-thinking',
        name: 'Sequential Thinking',
        package: '@modelcontextprotocol/server-sequential-thinking',
        description: 'Structured step-by-step reasoning tool for complex problem-solving.',
        category: 'devtools',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-sequential-thinking'],
        tags: ['reasoning', 'thinking'],
    },

    // ── Productivity ──────────────────────────────────────────────────────────
    {
        slug: 'github',
        name: 'GitHub',
        package: '@modelcontextprotocol/server-github',
        description: 'GitHub — manage repos, issues, PRs, code search.',
        category: 'productivity',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-github'],
        requiredEnv: ['GITHUB_PERSONAL_ACCESS_TOKEN'],
        tags: ['github', 'git', 'code'],
    },
    {
        slug: 'linear',
        name: 'Linear',
        package: '@linear/mcp-server',
        description: 'Linear issue tracker — create, update, list issues and projects.',
        category: 'productivity',
        command: 'npx',
        args: ['-y', '@linear/mcp-server'],
        requiredEnv: ['LINEAR_API_KEY'],
        homepage: 'https://linear.app',
        tags: ['issues', 'project-management'],
    },
    {
        slug: 'notion',
        name: 'Notion',
        package: '@modelcontextprotocol/server-notion',
        description: 'Read and write Notion pages and databases.',
        category: 'productivity',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-notion'],
        requiredEnv: ['NOTION_API_KEY'],
        tags: ['docs', 'notes', 'knowledge-base'],
    },
    {
        slug: 'jira',
        name: 'Jira',
        package: 'mcp-jira',
        description: 'Jira issue management — search, create, update tickets.',
        category: 'productivity',
        command: 'npx',
        args: ['-y', 'mcp-jira'],
        requiredEnv: ['JIRA_URL', 'JIRA_EMAIL', 'JIRA_API_TOKEN'],
        tags: ['issues', 'project-management'],
    },

    // ── Communication ─────────────────────────────────────────────────────────
    {
        slug: 'slack',
        name: 'Slack',
        package: '@modelcontextprotocol/server-slack',
        description: 'Slack — read channels, post messages, search conversations.',
        category: 'communication',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-slack'],
        requiredEnv: ['SLACK_BOT_TOKEN'],
        tags: ['slack', 'messaging'],
    },

    // ── Data ──────────────────────────────────────────────────────────────────
    {
        slug: 'postgres',
        name: 'PostgreSQL',
        package: '@modelcontextprotocol/server-postgres',
        description: 'Query and inspect PostgreSQL databases.',
        category: 'data',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-postgres'],
        requiredEnv: ['DATABASE_URL'],
        tags: ['database', 'sql', 'postgres'],
    },
    {
        slug: 'sqlite',
        name: 'SQLite',
        package: '@modelcontextprotocol/server-sqlite',
        description: 'Query and manage SQLite databases.',
        category: 'data',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-sqlite'],
        tags: ['database', 'sql', 'sqlite'],
    },

    // ── Cloud ─────────────────────────────────────────────────────────────────
    {
        slug: 'aws-kb',
        name: 'AWS Knowledge Base',
        package: '@aws/kb-retrieval-mcp-server',
        description: 'Retrieve from AWS Bedrock Knowledge Bases.',
        category: 'cloud',
        command: 'npx',
        args: ['-y', '@aws/kb-retrieval-mcp-server'],
        requiredEnv: ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_REGION'],
        tags: ['aws', 'cloud', 'rag'],
    },
    {
        slug: 'cloudflare',
        name: 'Cloudflare',
        package: '@cloudflare/mcp-server-cloudflare',
        description: 'Manage Cloudflare Workers, KV, R2, and D1.',
        category: 'cloud',
        command: 'npx',
        args: ['-y', '@cloudflare/mcp-server-cloudflare'],
        requiredEnv: ['CLOUDFLARE_API_TOKEN'],
        tags: ['cloudflare', 'cloud', 'workers'],
    },
];

const CATEGORY_LABELS: Record<McpCategory, string> = {
    browser:       'Browser & Automation',
    search:        'Search',
    devtools:      'Dev Tools',
    productivity:  'Productivity',
    communication: 'Communication',
    data:          'Data & Databases',
    cloud:         'Cloud',
};

export class McpRegistry {
    /** Find by exact slug or case-insensitive name/package match */
    static find(query: string): McpRegistryEntry | undefined {
        const q = query.toLowerCase().trim();
        return MCP_REGISTRY.find(e =>
            e.slug === q ||
            e.name.toLowerCase() === q ||
            e.package.toLowerCase() === q ||
            e.package.toLowerCase().includes(q)
        );
    }

    /** Full-text search across slug, name, description, tags */
    static search(query: string): McpRegistryEntry[] {
        const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
        if (terms.length === 0) return MCP_REGISTRY;

        return MCP_REGISTRY.filter(e => {
            const haystack = [
                e.slug, e.name, e.description,
                e.category, ...(e.tags ?? []),
            ].join(' ').toLowerCase();
            return terms.every(t => haystack.includes(t));
        });
    }

    /** Group all entries by category */
    static byCategory(): Map<McpCategory, McpRegistryEntry[]> {
        const map = new Map<McpCategory, McpRegistryEntry[]>();
        for (const entry of MCP_REGISTRY) {
            const list = map.get(entry.category) ?? [];
            list.push(entry);
            map.set(entry.category, list);
        }
        return map;
    }

    static categoryLabel(cat: McpCategory): string {
        return CATEGORY_LABELS[cat] ?? cat;
    }

    static all(): McpRegistryEntry[] {
        return MCP_REGISTRY;
    }
}
