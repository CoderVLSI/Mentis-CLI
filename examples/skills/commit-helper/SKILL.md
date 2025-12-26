---
name: commit-helper
description: Generates clear, conventional commit messages from git diffs. Use when writing commit messages, reviewing staged changes, or when the user asks for help with git commits.
allowed-tools: ["GitStatus", "GitDiff", "GitCommit"]
---

# Commit Message Helper

This skill helps you write clear, informative git commit messages following conventional commit format.

## Instructions

When the user wants to commit changes:

1. **Check git status** to see what files are staged
2. **Review the diff** to understand what changed
3. **Generate a commit message** with:
   - **Type**: One of `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`
   - **Scope**: (optional) The component or module affected
   - **Summary**: Brief description under 50 characters
   - **Body**: Detailed explanation of what and why (not how)
   - **Footer**: (optional) Breaking changes or references

## Commit Types

| Type | Description |
|------|-------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation changes |
| `style` | Code style changes (formatting, etc.) |
| `refactor` | Code refactoring |
| `test` | Adding or updating tests |
| `chore` | Maintenance tasks |

## Examples

### Feature Addition
```
feat(api): add user authentication endpoint

Add OAuth2 authentication for the REST API.
Implements login, logout, and token refresh.
```

### Bug Fix
```
fix(cli): prevent crash when config file is missing

Check for config file existence before reading.
Show helpful error message if file not found.
```

### Documentation
```
docs: update README with new installation instructions

Clarify NPM installation steps and add troubleshooting section.
```

## Best Practices

- Use present tense ("add" not "added")
- Explain what and why, not how
- Keep summary under 50 characters
- Reference issues in footer: `Closes #123`
