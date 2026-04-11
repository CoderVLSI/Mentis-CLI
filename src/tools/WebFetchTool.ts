/**
 * WebFetchTool - Fetch content from a specific URL
 *
 * Complements WebSearchTool (which searches for URLs) by allowing
 * the AI to read the actual content at a known URL — documentation,
 * GitHub raw files, API responses, etc.
 *
 * Uses axios, which is already a project dependency.
 */

import { Tool } from './Tool';
import axios from 'axios';

const DEFAULT_MAX_CHARS = 8000;
const FETCH_TIMEOUT_MS  = 15_000;
const MAX_RESPONSE_SIZE = 5 * 1024 * 1024; // 5 MB

/** Minimal HTML → plain-text conversion without extra dependencies. */
function htmlToText(html: string): string {
    return html
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&amp;/g,  '&')
        .replace(/&lt;/g,   '<')
        .replace(/&gt;/g,   '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g,  "'")
        .replace(/&nbsp;/g, ' ')
        .replace(/[ \t]{2,}/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

export class WebFetchTool implements Tool {
    name = 'web_fetch';
    description = [
        'Fetch the content of a specific URL and return it as text.',
        'Use this to read documentation pages, GitHub raw files, or any known URL.',
        'For finding URLs use web_search instead.',
    ].join(' ');

    parameters = {
        type: 'object',
        properties: {
            url: {
                type: 'string',
                description: 'The URL to fetch.',
            },
            maxChars: {
                type: 'number',
                description: `Maximum characters to return (default: ${DEFAULT_MAX_CHARS}).`,
            },
        },
        required: ['url'],
    };

    async execute(args: { url: string; maxChars?: number }): Promise<string> {
        const maxChars = args.maxChars ?? DEFAULT_MAX_CHARS;

        try {
            const response = await axios.get<string>(args.url, {
                timeout: FETCH_TIMEOUT_MS,
                headers: {
                    'User-Agent': 'Mentis-CLI/1.0 (AI coding assistant)',
                    'Accept':     'text/html,application/xhtml+xml,text/plain,*/*',
                },
                responseType:       'text',
                maxContentLength:   MAX_RESPONSE_SIZE,
                maxBodyLength:      MAX_RESPONSE_SIZE,
            });

            const contentType = (response.headers['content-type'] as string | undefined) ?? '';
            let content: string = response.data;

            if (contentType.includes('text/html')) {
                content = htmlToText(content);
            }

            if (content.length > maxChars) {
                content = content.slice(0, maxChars)
                    + `\n\n[... content truncated at ${maxChars} characters]`;
            }

            return `URL: ${args.url}\nStatus: ${response.status}\n\n${content}`;
        } catch (error: any) {
            if (error.response) {
                return `Error fetching ${args.url}: HTTP ${error.response.status} ${error.response.statusText}`;
            }
            return `Error fetching ${args.url}: ${error.message}`;
        }
    }
}
