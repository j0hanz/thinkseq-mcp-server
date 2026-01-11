# AGENTS.md

## Project Overview

- **What this repo is:** An MCP (Model Context Protocol) stdio server that exposes a single tool, `thinkseq`, for structured sequential thinking with in-memory history and revision support.
- **Primary stack:** TypeScript (ESM, NodeNext) + `@modelcontextprotocol/sdk` + Zod v4.
- **Entry point:** `src/index.ts` (CLI wrapper) → `src/app.ts` (server wiring). Build output is `dist/index.js`.

## Repo Map / Structure

- `src/`: TypeScript source
  - `src/index.ts`: CLI entry (help/config parsing) and server startup
  - `src/app.ts`: App bootstrap + MCP wiring + shutdown hooks
  - `src/engine.ts`: Core `ThinkingEngine` (in-memory thought + revision processing)
  - `src/schemas/`: Zod schemas for tool inputs/outputs
  - `src/lib/`: Shared utilities (cli, diagnostics, errors, protocol/stdio guards, etc.)
  - `src/tools/`: MCP tool registration (includes `thinkseq`)
- `tests/`: Node.js test runner tests (`*.test.ts`) + helpers
- `benchmark/`: Benchmarks (see `npm run benchmark`)
- `scripts/`: Repo automation (notably `scripts/Quality-Gates.ps1`) and metrics JSONs
- `metrics/`: Generated metric snapshots (JSON)
- `docs/`: Repo assets (currently `docs/logo.png`)
- `dist/`: Build output (generated)

## Setup & Environment

- **Node.js:** `>=20.0.0` (see `package.json` `engines.node`).
- **Package manager:** npm (repo has `package-lock.json`).
- Install deps (clean): `npm ci`
- Install deps (dev): `npm install`

## Development Workflow

- Dev/watch mode (runs from TS sources): `npm run dev`
- Build (emits `dist/`): `npm run build`
- Run built server locally: `npm start`
- Inspect with MCP Inspector (interactive UI): `npm run inspector`

Note: The published binary is `thinkseq` (see `package.json` `bin`) which points to `dist/index.js`.

## Testing

- All tests: `npm test`
  - Uses Node’s built-in test runner with TS execution via `tsx/esm`.
  - Test pattern: `tests/*.test.ts`.
- CI-style tests (build first): `npm run test:ci`
- Coverage: `npm run test:coverage`

## Code Style & Conventions

- **TypeScript mode:** `module: NodeNext`, `strict: true`, `exactOptionalPropertyTypes: true` (see `tsconfig.json`).
- **ESM import rule:** local imports use `.js` extensions (NodeNext resolution).
- **Lint:** `npm run lint` (ESLint flat config in `eslint.config.mjs`).
  - Strict type-aware rules are enabled for `src/**/*.ts`.
  - Notable conventions enforced by lint:
    - Prefer `import { type X }` for type-only imports.
    - Explicit return types on exported functions.
    - No `any`.
    - Naming conventions (camelCase/PascalCase, etc.).
- **Format:** Prettier is configured; format with `npm run format` and verify with `npm run format:check`.

## Build / Release

- Build output directory: `dist/`.
- Build command: `npm run build` (TypeScript compile + sets executable mode on `dist/index.js`).
- Release/publish:
  - GitHub Action: `.github/workflows/publish.yml`
  - Trigger: GitHub Release `published`
  - Publishes to npm using **Trusted Publishing (OIDC)**.

## Security & Safety

- **Transport:** stdio MCP server; avoid writing non-JSON-RPC output to stdout while running as an MCP server.
- **State:** in-memory only (no DB); thoughts are not persisted across runs.
- **Secrets:** do not commit credentials/tokens. Use environment variables / CI secrets.
- **Input validation:** tool inputs/outputs are validated via Zod schemas in `src/schemas/`.

## Pull Request / Commit Guidelines

- Run the local gates before submitting:
  - `npm run lint`
  - `npm run type-check`
  - `npm test`
  - `npm run build`
- Keep changes minimal and consistent with existing patterns (ESM, `.js` import specifiers, strict typing).
- No specific commit message convention is defined in-repo; follow your team’s default.
