# AGENTS.md

## Project Overview

- **Goal**: Provides an MCP server (`thinkseq`) for structured, sequential thinking with branching and revision support.
- **Stack**: Node.js (>=20), TypeScript (ES2022/NodeNext), MCP SDK, Zod, native Node test runner.

## Repo Map / Structure

- `src/`: Source code
  - `app.ts`: MCP server application setup and wiring.
  - `engine.ts`: Core thinking engine logic (in-memory state management).
  - `index.ts`: Application entry point.
  - `lib/`: Shared utilities (diagnostics, protocol guards, stdio guards).
  - `schemas/`: Zod schemas for validation inputs/outputs.
  - `tools/`: Tool definitions (specifically `thinkseq.ts`).
- `tests/`: Unit tests matching source structure (e.g., `engine.test.ts`).
- `benchmark/`: Performance benchmark scripts.
- `dist/`: Compiled JavaScript output (generated).
- `docs/`: Documentation assets and deep dives.

## Setup & Environment

- **Install dependencies**: `npm install`
- **Engine requirement**: Node.js >= 20.0.0
- **Configuration**: Zero-config; runs over stdio. No `.env` required for basic operation.

## Development Workflow

- **Dev mode**: `npm run dev` (runs `src/index.ts` with `tsx` in watch mode)
- **type-check**: `npm run type-check` (runs `tsc` without emitting files)
- **Start production**: `npm start` (runs `dist/index.js`)
- **Inspector**: `npm run inspector` (launches MCP inspector)

## Testing

- **Run all tests**: `npm test` (uses Node.js native test runner)
- **Run with coverage**: `npm run test:coverage`
- **Benchmarks**: `npm run benchmark`
- **Test location**: Files ending in `.test.ts` inside `tests/`.

## Code Style & Conventions

- **Language**: TypeScript (Target ES2022, Module NodeNext).
- **Lint**: `npm run lint` (ESLint 9).
- **Format**: `npm run format` (Prettier).
- **Check format**: `npm run format:check`.
- **Imports**: Uses `tsx` for execution during dev/test. Explicit extensions required in imports where applicable due to `NodeNext`.

## Build / Release

- **Build command**: `npm run build` (runs `tsc`).
- **Clean**: `npm run clean` (removes `dist/`).
- **Output directory**: `dist/` contains the compiled JS and type definitions.
- **Pre-publish**: `npm run prepublishOnly` ensures lint, type-check, and clean build before publishing.

## Security & Safety

- **Stdio Isolation**: Server runs strictly over stdio; no external network ports opened by default.
- **Input Validation**: All tool inputs strictly validated via Zod schemas (`src/schemas/inputs.ts`).

## Pull Request / Commit Guidelines

- **Validation**: Ensure `npm run lint`, `npm run type-check`, and `npm test` pass before committing.
- **Cleanliness**: Run `npm run format` to ensure code style compliance.
