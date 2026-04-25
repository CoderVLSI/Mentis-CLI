/**
 * AgentDefinition - Type definitions for subagents in Mentis CLI
 *
 * Agents are specialized AI configurations that can be spawned by the main
 * agent to handle specific tasks (web research, code review, test running, etc.)
 *
 * Custom agents can be defined in markdown files with YAML frontmatter at
 * `.mentis/agents/<name>.md` (project) or `~/.mentis/agents/<name>.md` (global):
 *
 * ---
 * name: web-researcher
 * description: Research documentation and return summaries
 * tools: [web_search, web_fetch]
 * ---
 *
 * You are a web research specialist. Your job is to…
 */

export interface AgentDefinition {
    /** Unique identifier — used when spawning the agent */
    name: string;
    /** Description shown to the main LLM so it knows when to spawn this agent */
    description: string;
    /**
     * Allowed tool names. If undefined or empty, the agent has no tools
     * (pure reasoning / summarisation only).
     */
    tools?: string[];
    /** The system prompt that defines the agent's role and workflow */
    systemPrompt: string;
    /** Path the agent definition was loaded from (for debugging) */
    filePath?: string;
}
