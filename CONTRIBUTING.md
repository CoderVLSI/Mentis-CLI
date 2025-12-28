# Contributing to Mentis CLI

Thank you for your interest in contributing to Mentis CLI! This document provides guidelines for contributing.

## Table of Contents

- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Coding Standards](#coding-standards)
- [Testing](#testing)
- [Submitting Changes](#submitting-changes)
- [Feature Ideas](#feature-ideas)

## Development Setup

### Prerequisites

- Node.js 18+
- npm or yarn
- Git

### Fork and Clone

```bash
# Fork the repository on GitHub
git clone https://github.com/YOUR_USERNAME/Mentis-CLI.git
cd Mentis-CLI
```

### Install Dependencies

```bash
npm install
# or with legacy peer deps if needed
npm install --legacy-peer-deps
```

### Build

```bash
npm run build
```

### Link for Local Testing

```bash
npm link
# Now you can run 'mentis' anywhere
```

## Project Structure

Key directories:

- `src/` - TypeScript source code
- `src/llm/` - LLM provider implementations
- `src/tools/` - Tool implementations
- `src/skills/` - Agent Skills system
- `src/commands/` - Custom Commands system
- `src/ui/` - User interface components
- `src/**/__tests__/` - Jest test files

## Coding Standards

### TypeScript

- Use strict TypeScript settings
- Add JSDoc comments for exported functions/classes
- Define interfaces for all complex types

### Code Style

- Use 4 spaces for indentation
- Prefer `const` over `let`
- Use arrow functions for callbacks
- Add error handling with specific error codes

### Naming Conventions

- Classes: `PascalCase`
- Functions/variables: `camelCase`
- Interfaces: `PascalCase` with `I` prefix avoided
- Private members: `camelCase` with no prefix (TypeScript's `private` keyword)

### Example

```typescript
/**
 * Calculate token usage from message history
 */
export function calculateUsage(history: ChatMessage[]): ContextUsage {
    let totalChars = 0;

    for (const msg of history) {
        if (msg.content) {
            totalChars += msg.content.length;
        }
    }

    return {
        tokens: Math.ceil(totalChars / 4),
        percentage: Math.round((totalChars / maxTokens) * 100),
        maxTokens
    };
}
```

## Testing

### Running Tests

```bash
npm test              # Run all tests
npm run test:watch    # Watch mode
npm run test:coverage # Coverage report
```

### Writing Tests

- Place test files in `src/**/__tests__/`
- Name test files: `*.test.ts`
- Use Jest conventions (`describe`, `it`, `expect`)

### Example Test

```typescript
describe('MyFunction', () => {
    it('should return expected result', () => {
        const result = myFunction('input');
        expect(result).toBe('expected');
    });
});
```

### Test Coverage

Aim for:
- Branches: 50%+
- Functions: 70%+
- Lines: 70%+

## Submitting Changes

### Commit Messages

Use conventional commit format:

```
type(scope): description

feat(tools): add new file search tool
fix(repl): handle empty input gracefully
docs(readme): update installation instructions
test(skills): add validation tests
```

### Pull Request Process

1. Create a branch from `main`
2. Make your changes
3. Add/update tests
4. Run tests: `npm test`
5. Build: `npm run build`
6. Commit with conventional message
7. Push to your fork
8. Open a pull request

### PR Checklist

- [ ] Tests pass
- [ ] New features include tests
- [ ] Documentation updated
- [ ] Commit messages follow conventions
- [ ] No console errors/warnings

## Feature Ideas

Looking for something to work on? Here are some ideas:

### High Priority

- [ ] Add more LLM providers (Mistral, Cohere, etc.)
- [ ] Implement MCP server protocol
- [ ] Add skill templates/generator
- [ ] Improve error recovery

### Medium Priority

- [ ] Add conversation search
- [ ] Implement plugin system
- [ ] Add code generation templates
- [ ] Improve completions for custom commands

### Low Priority

- [ ] Add themes for UI
- [ ] Implement voice input
- [ ] Add collaborative features
- [ ] Create web UI

## Questions?

- Open an issue for bugs or feature requests
- Start a discussion for questions
- Check existing issues before creating new ones

## License

By contributing, you agree that your contributions will be licensed under the ISC License.
