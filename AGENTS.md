# AGENTS.md

## Project Overview

- This repository builds and publishes an MCP (Model Context Protocol) server + CLI named `thinkseq`.
- Tech stack: Node.js (ESM), TypeScript, `@modelcontextprotocol/sdk`, Zod.
- Primary entrypoint: `src/index.ts` (CLI + stdio server wiring via `run()` from `src/app.ts`).
- Package output: `dist/` (published entry: `dist/index.js`, types: `dist/index.d.ts`).

## Repo Map / Structure

- `src/`: TypeScript source for the MCP server and tool implementation.
  - `src/index.ts`: CLI entrypoint (has a `#!/usr/bin/env node` shebang).
  - `src/tools/`: MCP tool registrations (e.g. `thinkseq`).
  - `src/schemas/`: Zod input/output schemas.
  - `src/lib/`: CLI parsing, protocol guards, stdio helpers, diagnostics, errors.
  - `src/engine/`: thought storage, revision logic, queries.
  - `src/instructions.md`: tool usage instructions copied into `dist/` during build.
- `tests/`: Node.js test suite (`tests/*.test.ts`).
- `benchmark/`: benchmarks (e.g. `benchmark/engine.bench.ts`).
- `docs/`: repo assets (e.g. `docs/logo.png`).
- `scripts/`: automation helpers (e.g. `scripts/Quality-Gates.ps1`).
- `metrics/`: metrics output location referenced by scripts.
- `dist/`: build output (generated).

## Setup & Environment

- Node.js: `>=20.0.0` (see `package.json` `engines.node`).
- Package manager: npm (this repo includes `package-lock.json`; CI uses `npm ci`).
- Install dependencies:
  - Clean install (CI-like): `npm ci`
  - Local dev install: `npm install`

## Development Workflow

- Dev (watch): `npm run dev` (runs `tsx watch src/index.ts`).
- Build: `npm run build`
  - Compiles with `tsc -p tsconfig.build.json`.
  - Copies `src/instructions.md` to `dist/instructions.md`.
- Start (built output): `npm start` (runs `node dist/index.js`).
- CLI usage (from README): `thinkseq --max-thoughts 500 --max-memory-mb 100`

## Testing

- All tests: `npm test` (runs Node’s test runner over `tests/*.test.ts` via `tsx/esm`).
- CI-style test run: `npm run test:ci` (build then test).
- Coverage (Node experimental): `npm run test:coverage`.
- Test location/pattern: `tests/*.test.ts`.

## Code Style & Conventions

- Language: TypeScript (tsconfig target `ES2022`, module `NodeNext`, ESM package).
- Imports:
  - Local imports use `.js` extensions (NodeNext runtime resolution).
  - Prefer type-only imports (see ESLint rules).
- Lint: `npm run lint` (ESLint flat config in `eslint.config.mjs`).
- Format:
  - Write: `npm run format`
  - Check: `npm run format:check`
- Type-check (no emit): `npm run type-check`.
- Notable lint rules enforced:
  - `unused-imports/no-unused-imports` (error)
  - Consistent type imports/exports
  - Explicit return types on functions
  - `@typescript-eslint/no-explicit-any` (error)

## Build / Release

- Build output directory: `dist/`.
- Release publish workflow:
  - GitHub Actions workflow `.github/workflows/publish.yml` runs on GitHub Release `published`.
  - Steps include: `npm ci`, `npm run lint`, `npm run type-check`, `npm run test`, `npm run test:coverage`, then `npm run build`, then `npm publish --access public`.

## Security & Safety

- No environment variables are required for basic operation (per README).
- This server runs over stdio; avoid writing non-protocol output to stdout during runtime. Prefer `console.error()` for diagnostics.
- `scripts/Quality-Gates.ps1` includes optional security checks via `npm audit` and dependency health via `npm outdated`.

## Pull Request / Commit Guidelines

- Pre-publish checks (mirrors `prepublishOnly`): `npm run lint && npm run type-check && npm run build`.
- CI workflow additionally runs `npm run test` and `npm run test:coverage` on publish.
- Commit message format: not specified in repo files.
