# AGENTS.md

## Project Overview

- **Name**: ThinkSeq MCP Server (`@j0hanz/thinkseq-mcp`)
- **Description**: An MCP server for structured, sequential thinking, running over stdio.
- **Stack**: Node.js (>=20), TypeScript, MCP SDK (`@modelcontextprotocol/sdk`), Zod.

## Repo Map / Structure

- `.github/`: CI workflows and prompts.
- `benchmark/`: Performance benchmarks (`engine.bench.ts`).
- `dist/`: Build output (compiled JS and type definitions).
- `docs/`: Documentation assets.
- `src/`: Source code.
  - `engine/`: Core thinking logic (pruning, revision, queries).
  - `lib/`: Utilities (diagnostics, errors, guards).
  - `schemas/`: Zod schemas for inputs/outputs.
  - `tools/`: MCP tool definitions (`thinkseq`).
- `tests/`: Node.js test runner suite.

## Setup & Environment

- **Prerequisites**: Node.js >= 20.0.0.
- **Install dependencies**: `npm install`
- **Main config**: `package.json` (scripts, deps), `tsconfig.json` (build), `eslint.config.mjs` (linting).

## Development Workflow

- **Dev mode**: `npm run dev` (runs `tsx watch src/index.ts`).
- **Build**: `npm run build` (runs `tsc`).
- **Start (production)**: `npm start` (runs `node dist/index.js`).
- **Inspect**: `npm run inspector` (runs `@modelcontextprotocol/inspector`).

## Testing

- **Run all tests**: `npm test` (uses Node.js native test runner).
- **Test with coverage**: `npm run test:coverage`
- **Benchmark**: `npm run benchmark`
- **Test location**: `tests/*.test.ts`

## Code Style & Conventions

- **Language**: TypeScript 5.x.
- **Lint**: `npm run lint` (ESLint).
- **Format**: `npm run format` (Prettier).
- **Check types**: `npm run type-check` (tsc noEmit).
- **Check format**: `npm run format:check`

## Build / Release

- **Build output**: `dist/` directory.
- **Clean build**: `npm run clean`
- **Pre-publish**: `npm run prepublishOnly` (lints, type-checks, and builds).
- **Release**: Triggered by GitHub Release (published type). Actions workflow builds and publishes to npm.

## Security & Safety

- **Transport**: Standard Input/Output (stdio).
- **Validation**: Uses Zod for strict input schema validation.
- **Dependencies**: Minimal dependencies (`@modelcontextprotocol/sdk`, `zod`).

## Pull Request / Commit Guidelines

- **Required checks**: CI runs `lint`, `type-check`, `test`, and `test:coverage`.
- **Recommended**: Run `npm run lint && npm run type-check && npm run test` locally before pushing.

## Troubleshooting

- **Discrepancies**: CI workflow references `maintainability` and `duplication` scripts which are missing in `package.json`.
