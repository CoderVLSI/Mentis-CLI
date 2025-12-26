# Agent Skills - User Guide

## Overview

Agent Skills allow you to package your expertise into modular, reusable capabilities that Mentis can autonomously discover and use. Skills are organized folders containing instructions, scripts, and resources that extend Mentis's functionality.

## How Skills Work

1. **Discovery**: Mentis scans `~/.mentis/skills/` (personal) and `.mentis/skills/` (project) for skills
2. **Metadata Injection**: At startup, skill names and descriptions are added to the system context
3. **Model-Invoked**: When Mentis determines a skill is relevant to your request, it automatically loads the full skill content
4. **Progressive Disclosure**: Supporting files are only loaded when explicitly referenced

## Skill Structure

```
skill-directory/
├── SKILL.md           # Required: YAML frontmatter + instructions
├── reference.md       # Optional: Additional documentation
├── examples.md        # Optional: Usage examples
├── scripts/           # Optional: Executable utilities
│   └── helper.py
└── templates/         # Optional: File templates
    └── template.txt
```

## SKILL.md Format

```yaml
---
name: your-skill-name
description: What this skill does and when to use it
allowed-tools: Read, Grep, Glob  # Optional: Restrict tools
---

# Your Skill Name

## Instructions
Step-by-step guidance for Mentis.

## Examples
Concrete usage examples.
```

### Required Fields

- **name**: Lowercase letters, numbers, hyphens only (max 64 characters)
- **description**: What the skill does + when to use it (max 1024 characters)

### Optional Fields

- **allowed-tools**: List of tools the skill can use without permission

## Creating Your First Skill

### Option 1: Interactive Wizard

```
/skills create
```

Follow the prompts:
1. Enter skill name (e.g., `my-custom-skill`)
2. Choose type (personal or project)
3. Write description (include "Use when..." for better discovery)
4. Optionally restrict allowed tools

### Option 2: Manual Creation

```bash
# Create directory
mkdir -p ~/.mentis/skills/my-skill

# Create SKILL.md
cat > ~/.mentis/skills/my-skill/SKILL.md << 'EOF'
---
name: my-skill
description: Does something useful. Use when the user mentions specific keywords.
---

# My Skill

## Instructions
1. Do this first
2. Then do that

## Examples
Example usage...
EOF
```

## Skill Commands

| Command | Description |
|---------|-------------|
| `/skills` | List all available skills |
| `/skills list` | List all available skills |
| `/skills show <name>` | Display full skill content |
| `/skills create [name]` | Interactive skill creator |
| `/skills validate` | Validate all skills for errors |

## Skill Types

### Personal Skills

Stored in `~/.mentis/skills/` - available across all projects.

**Use for**:
- Individual workflows and preferences
- Experimental skills in development
- Personal productivity tools

### Project Skills

Stored in `.mentis/skills/` - shared with your team via git.

**Use for**:
- Team workflows and conventions
- Project-specific expertise
- Shared utilities and scripts

## Best Practices

### 1. Write Clear Descriptions

❌ **Too vague**:
```yaml
description: Helps with data
```

✅ **Specific**:
```yaml
description: Analyze Excel spreadsheets, generate pivot tables, create charts. Use when working with Excel files, spreadsheets, or .xlsx files.
```

**Tip**: Include both what the skill does AND when to use it.

### 2. Use Progressive Disclosure

Keep `SKILL.md` lean. Move detailed content to supporting files:

**SKILL.md**:
```markdown
## Quick Start
Basic instructions here.

For advanced patterns, see [reference.md](reference.md).
```

**reference.md**:
```markdown
# Advanced Reference
Detailed documentation...
```

### 3. Validate Your Skills

```
/skills validate
```

Check for:
- Missing required fields
- Invalid name format
- Description length
- Unknown tools in allowed-tools

### 4. Test Skills

After creating a skill:
1. Restart Mentis to load it
2. Ask a question that should trigger the skill
3. Verify Mentis loads and uses the skill

## Example Skills

### commit-helper

```yaml
---
name: commit-helper
description: Generates clear, conventional commit messages from git diffs. Use when writing commit messages or reviewing staged changes.
allowed-tools: ["GitStatus", "GitDiff", "GitCommit"]
---
```

### code-reviewer

```yaml
---
name: code-reviewer
description: Reviews code for best practices, potential bugs, security issues. Use when reviewing code or checking PRs.
allowed-tools: ["Read", "Grep", "Glob"]
---
```

See `examples/skills/` for complete examples.

## Troubleshooting

### Skill Not Loading

**Check 1**: File location
```bash
# Personal skills
ls ~/.mentis/skills/my-skill/SKILL.md

# Project skills
ls .mentis/skills/my-skill/SKILL.md
```

**Check 2**: YAML syntax
```bash
# Verify frontmatter format
cat ~/.mentis/skills/my-skill/SKILL.md | head -n 10
```

Ensure:
- `---` on line 1
- `---` closes frontmatter
- Valid YAML (no tabs, correct indentation)

**Check 3**: Validation
```bash
/skills validate
```

### Mentis Not Using Skill

**Problem**: Skill exists but Mentis doesn't invoke it.

**Solution**: Improve description to include trigger keywords.

❌ **Vague**:
```yaml
description: Code improvement
```

✅ **Clear with triggers**:
```yaml
description: Refactor code for better performance and readability. Use when the user mentions optimization, refactoring, performance, or code cleanup.
```

### allowed-tools Not Working

**Check**: Tool names must match Mentis tool names exactly.

Valid tools: `Read`, `Write`, `Edit`, `Grep`, `Glob`, `ListDir`, `SearchFile`, `RunShell`, `WebSearch`, `GitStatus`, `GitDiff`, `GitCommit`, `GitPush`, `GitPull`

## Sharing Skills

### Via Git (Project Skills)

```bash
# Add to repository
git add .mentis/skills/
git commit -m "Add team skill for X"
git push

# Team members get it automatically
git pull
# Skill is now available
```

### Via Manual Copy

```bash
# Export
tar czf my-skill.tar.gz -C ~/.mentis/skills my-skill

# Import on another machine
tar xzf my-skill.tar.gz -C ~/.mentis/skills
```

## Advanced Topics

### Code Execution in Skills

Skills can include executable scripts:

```markdown
## Running the Script

```bash
python scripts/analyze.py data.csv
```
```

Mentis will execute the script and return results.

### Tool Permissions

Use `allowed-tools` to:
- Restrict read-only skills from making changes
- Limit scope of specialized skills
- Add security for sensitive operations

```yaml
---
allowed-tools: ["Read", "Grep", "Glob"]
---
```

When this skill is active, only these tools can be used without explicit permission.

### Dynamic Tool Loading

The model can invoke tools to load skills:

```
load_skill({ name: "pdf-processing" })
```

This loads the full SKILL.md content into context.

## Resources

- [Claude Code Agent Skills](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills) - Official announcement
- [examples/skills/](../examples/skills/) - Example skills directory
