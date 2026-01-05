# AGENTS.md

## Project Overview

- **ThinkSeq MCP Server**: An MCP (Model Context Protocol) implementation for advanced reasoning and thinking sequences
- **Primary Stack**: TypeScript, Node.js ≥20, MCP SDK (`@modelcontextprotocol/sdk`), Zod v4 for schema validation
- **Purpose**: Provides a single tool (`thinkseq`) for structured sequential thinking with branching and revision support

## Repo Map / Structure

- `src/`: TypeScript source files
  - `index.ts`: Server entry point (stdio transport)
  - `engine.ts`: Core `ThinkingEngine` class managing thought processing
  - `tools/`: Tool registration (`thinkseq.ts`, `index.ts`)
  - `schemas/`: Zod input/output schemas (`inputs.ts`, `outputs.ts`)
  - `lib/`: Shared utilities (`types.ts`, `errors.ts`, `tool_response.ts`)
- `dist/`: Build output (generated, git-ignored)
- `tests/`: Test files using Node.js built-in test runner
- `.github/`: Instructions, agents, and prompt files

## Setup & Environment

- **Install dependencies**: `npm install`
- **Node version**: Requires Node.js ≥20.0.0
- **No environment variables** required for basic operation

## Development Workflow

- **Dev mode** (watch): `npm run dev`
- **Build**: `npm run build`
- **Start** (production): `npm start`
- **MCP Inspector**: `npm run inspector`

## Testing

- **All tests**: `npm test`
- **With coverage**: `npm run test:coverage`
- **Test runner**: Node.js built-in (`node --test`)
- **Test pattern**: `tests/*.test.ts`

## Code Style & Conventions

### Language & Tooling

- **TypeScript**: ES2022 target, strict mode, NodeNext module resolution
- **Lint**: `npm run lint` (ESLint with `typescript-eslint` strict + stylistic)
- **Format**: `npm run format` (Prettier)
- **Format check**: `npm run format:check`
- **Type check**: `npm run type-check`

### TypeScript Rules (Enforced)

- Explicit function return types required
- Type-only imports: `import type { X } from 'y'`
- No `any` — use `unknown` with narrowing
- No floating promises — always `await` or `void`
- Use `z.strictObject()` (not `z.object()`) for Zod schemas

### Import Conventions

Imports are auto-sorted by Prettier with this order:

1. Node built-ins (`node:*`)
2. Core Node modules (`fs`, `path`, etc.)
3. MCP SDK (`@modelcontextprotocol/*`)
4. Validation libs (`zod`, `glob`)
5. External packages
6. Relative imports (`./`, `../`)

### Naming Conventions

- Files: `kebab-case.ts` or `snake_case.ts`
- Classes: `PascalCase`
- Functions/variables: `camelCase`
- Types/interfaces: `PascalCase`
- Constants: `SCREAMING_SNAKE_CASE` or `camelCase`

### Prettier Configuration

- Single quotes, semicolons, 2-space indent
- Trailing commas (ES5), 80 char width
- LF line endings

## Build / Release

- **Build output**: `dist/` (TypeScript → JavaScript)
- **Prepublish hook**: `npm run prepublishOnly` runs lint + type-check + build
- **Package entry**: `dist/index.js`
- **Executable**: `thinkseq` (via npm bin)

## Security & Safety

- Tool is **not** read-only — each thought mutates internal state
- Tool is **not** idempotent — repeated calls accumulate history
- Validate all inputs via Zod before processing
- Graceful shutdown on `SIGTERM`/`SIGINT`

## Pull Request / Commit Guidelines

### Required Checks (Before PR)

```bash
npm run lint && npm run type-check && npm run build && npm test
```

Or use the combined task:

```bash
npm run lint && npm run type-check
```

### Commit Message Format

- Use clear, descriptive messages
- Reference issues when applicable

## Troubleshooting

| Issue                   | Solution                                   |
| ----------------------- | ------------------------------------------ |
| First thought must be 1 | Start sequences with `thoughtNumber: 1`    |
| Type errors with Zod    | Use `z.strictObject()` not `z.object()`    |
| Import order lint fails | Run `npm run format` to auto-fix           |
| Build fails on import   | Use `.js` extensions in TypeScript imports |

## Agent Operating Rules

1. **Search before editing**: Use grep/semantic search to understand existing patterns
2. **Read docs first**: Check `README.md` and `.github/instructions/` before modifying core behavior
3. **Avoid destructive commands**: No `rm -rf`, `git push --force` without confirmation
4. **Validate changes**: Run lint + type-check + tests after modifications
5. **Follow existing patterns**: Match the codebase style for new code
