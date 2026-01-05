# AGENTS.md

## Project Overview

- **ThinkSeq MCP Server**: An MCP implementation for advanced reasoning and thinking sequences, effectively enabling "Chain of Thought" with branching and revision capabilities for AI agents.
- **Tech Stack**:
  - Node.js (>=20.0.0)
  - TypeScript (ES2022 / NodeNext)
  - @modelcontextprotocol/sdk

## Repo Map / Structure

- `src/`: Source code
  - `engine.ts`: Core thinking engine logic
  - `tools/`: Tool definitions (e.g., `thinkseq.ts`)
  - `schemas/`: Zod validation schemas (`inputs.ts`, `outputs.ts`)
  - `lib/`: Shared utilities (diagnostics, package info, types)
- `tests/`: Native Node.js tests (`*.test.ts`)
- `dist/`: Compiled JavaScript output (generated)
- `docs/`: Logo and documentation assets

## Setup & Environment

- **Prerequisites**: Node.js >=20.0.0
- **Install Dependencies**: `npm install`
- **Environment config**: No strict `.env` required; configuration is handled via MCP initialization arguments if needed.

## Development Workflow

- **Dev Mode** (Watch): `npm run dev`
  - Runs `tsx watch src/index.ts`
- **Build**: `npm run build`
  - Runs `tsc` (outputs to `dist/`)
- **Start**: `npm start`
  - Runs `node dist/index.js`
- **MCP Inspector**: `npm run inspector`
  - Launches `@modelcontextprotocol/inspector` for interactive testing.

## Testing

- **Run All Tests**: `npm test`
  - Uses `node --test` with `tsx/esm` loader.
- **Coverage**: `npm run test:coverage`
  - Includes experimental test coverage.
- **Test Locations**: `tests/*.test.ts`

## Code Style & Conventions

- **Language**: TypeScript (Strict mode, ES2022)
- **Linting**: `npm run lint`
  - Uses `eslint` with `typescript-eslint` (strict + stylistic).
- **Formatting**: `npm run format`
  - Uses `prettier`.
- **Imports**: `type-imports` are enforced.
- **Rules**:
  - No `any` (`@typescript-eslint/no-explicit-any`)
  - Explicit function return types required.
  - No floating promises.

## Build / Release

- **Build Output**: `dist/` cleaned and regenerated on build.
- **Pre-publish**: `npm run prepublishOnly`
  - Automatically runs lint, type-check, and build.

## Security & Safety

- **Clean Scripts**: `npm run clean` uses strictly scoped deletion of `dist/`.
- **Input Validation**: All tool inputs are validated via `zod` schemas in `src/schemas/`.

## Pull Request / Commit Guidelines

- **Recommended Checks**: Run `npm run lint && npm run type-check && npm run build` before pushing.
- **Conventional Commits**: No strict enforcement found, but `clean`, `build`, `test` scripts imply standard workflows.
