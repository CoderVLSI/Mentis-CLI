---
name: code-reviewer
description: Reviews code for best practices, potential bugs, security issues, and improvements. Use when reviewing code, checking pull requests, or analyzing code quality.
allowed-tools: ["Read", "Grep", "Glob"]
---

# Code Reviewer

This skill provides systematic code review to identify issues and suggest improvements.

## Review Checklist

### 1. Code Organization
- [ ] Single Responsibility Principle followed
- [ ] Clear and descriptive names
- [ ] Proper separation of concerns
- [ ] Appropriate abstraction levels

### 2. Error Handling
- [ ] Proper error handling for all operations
- [ ] Meaningful error messages
- [ ] Graceful degradation
- [ ] No silent failures

### 3. Performance
- [ ] No obvious performance issues
- [ ] Appropriate data structures used
- [ ] Caching where applicable
- [ ] Resource cleanup (no memory leaks)

### 4. Security
- [ ] Input validation
- [ ] No hardcoded credentials
- [ ] SQL injection prevention
- [ ] XSS prevention (web apps)
- [ ] Proper authentication/authorization

### 5. Testing
- [ ] Test coverage adequate
- [ ] Edge cases considered
- [ ] Error scenarios tested

### 6. Documentation
- [ ] Complex logic explained
- [ ] Public API documented
- [ ] Usage examples provided

## How to Review

1. **Understand the purpose**: What is this code supposed to do?
2. **Read the code**: Follow the execution flow
3. **Check against checklist**: Go through each category
4. **Provide feedback**:
   - **Critical**: Must fix before merge
   - **Important**: Should fix
   - **Suggestion**: Nice to have
5. **Explain why**: Don't just point out problems

## Feedback Format

```markdown
## Critical Issues
- Issue description
  - Location: file.ts:123
  - Why: [reason]
  - Suggestion: [fix]

## Important Notes
- Note description
  - Location: file.ts:456

## Suggestions
- Suggestion description
  - Could improve [aspect]
```

## Common Issues to Look For

| Issue | Example |
|-------|---------|
| Unhandled promises | No `.catch()` or `await` without try/catch |
| Missing null checks | Accessing properties without null check |
| Race conditions | Async operations without proper ordering |
| Resource leaks | File handles, connections not closed |
| Type coercion | Using `==` instead of `===` |
| Magic numbers | Unexplained numeric literals |
| Large functions | Functions > 50 lines |
| Deep nesting | More than 3 levels of nesting |
