# AGENTS.md

> Purpose: High-signal context and strict guidelines for AI agents working in this repository.

## 1) Project Context

- **Domain:** Thinking and reasoning engine for the Model Context Protocol (MCP).
- **Tech Stack (Verified):**
  - **Languages:** TypeScript 5.9+, Node.js 22+ (evidence: `package.json`, `tsconfig.json`)
  - **Frameworks:** `@modelcontextprotocol/sdk` (evidence: `package.json`)
  - **Key Libraries:** `zod` (validation) (evidence: `package.json`)
- **Architecture:** Modular service architecture with explicit lifecycle management (`app.ts`, `engine.ts`) (evidence: `src/app.ts`, `src/engine.ts`)

## 2) Repository Map (High-Level)

- `src/`: Source code root (evidence: `tsconfig.json`)
- `src/index.ts`: Application entry point (evidence: `package.json` "main", "bin")
- `src/app.ts`: Core application wiring and lifecycle (evidence: `src/app.ts`)
- `src/engine/`: Reasoning engine implementation (evidence: `src/engine/`)
- `src/tools/`: MCP tool definitions (evidence: `src/tools/`)
- `src/schemas/`: Validation schemas (evidence: `src/schemas/`)
- `tests/`: Integration and unit tests (evidence: `tests/`)
- `scripts/`: Build and maintenance scripts (evidence: `scripts/`)
  > Ignore generated/vendor dirs like `dist/`, `node_modules/`.

## 3) Operational Commands (Verified)

- **Environment:** Node.js >=22.0.0 (evidence: `package.json` "engines")
- **Install:** `npm install` (evidence: `package-lock.json` presence)
- **Dev:** `npm run dev` (runs `tsc --watch`) or `npm run dev:run` (runs built app in watch mode) (evidence: `package.json`)
- **Test:** `npm test` (uses `node --test` with `tsx` loader) (evidence: `package.json`, `scripts/tasks.mjs`)
- **Build:** `npm run build` (full pipeline: clean, compile, validate, assets) (evidence: `package.json`, `scripts/tasks.mjs`)
- **Lint/Format:** `npm run lint` (ESLint) / `npm run format` (Prettier) (evidence: `package.json`)
- **Type-Check:** `npm run type-check` (evidence: `package.json`)

## 4) Coding Standards (Style & Patterns)

- **Naming:** camelCase for filenames (`appConfig.ts`, `engineConfig.ts`) and variables. (evidence: `src/` listing)
- **Structure:**
  - Logic split into `engine` (core logic) and `tools` (MCP interface).
  - Shared utilities in `src/lib`.
- **Typing/Strictness:** strict TypeScript enabled (`strict: true`, `noUncheckedIndexedAccess: true`). (evidence: `tsconfig.json`)
- **Patterns Observed:**
  - Dependency Injection/Wiring in `app.ts` via `run` function. (evidence: `src/app.ts`)
  - Zod schemas for data validation. (evidence: `src/schemas/`)
  - Custom task runner in `scripts/tasks.mjs` for build orchestration. (evidence: `scripts/tasks.mjs`)

## 5) Agent Behavioral Rules (Do Nots)

- Do not introduce new dependencies without updating `package.json`. (evidence: `package.json`)
- Do not edit `package-lock.json` manually. (evidence: `package-lock.json` presence)
- Do not bypass `scripts/tasks.mjs` for build/test operations (it handles assets and cleaning). (evidence: `package.json` scripts)
- Do not ignore TypeScript errors; `noUncheckedIndexedAccess` is on, handle undefined results. (evidence: `tsconfig.json`)
- Do not use CommonJS (`require`); project is ESM (`"type": "module"`, `NodeNext`). (evidence: `package.json`, `tsconfig.json`)

## 6) Testing Strategy (Verified)

- **Framework:** Native Node.js Test Runner (`node:test`, `node:assert/strict`). (evidence: `tests/app.test.ts`)
- **Where tests live:** `tests/` directory and `src/__tests__/`. (evidence: `scripts/tasks.mjs` config)
- **Approach:**
  - Heavy use of mocking/stubbing for process and dependencies (e.g., `createProcessStub`, `createRunState`). (evidence: `tests/app.test.ts`)
  - Integration tests verifying lifecycle events. (evidence: `tests/app.test.ts`)

## 7) Common Pitfalls (Optional; Verified Only)

- [pitfall] **Forgetting asset copy**: The build process explicitly copies `instructions.md` and `assets/`. Use `npm run build` to ensure this happens. (evidence: `scripts/tasks.mjs`)
- [pitfall] **ESM Imports**: Must use `.js` extension in imports or use directory imports (with `index.js`). (evidence: `tsconfig.json` `moduleResolution: "NodeNext"`)

## 8) Evolution Rules

- If conventions change, include an `AGENTS.md` update in the same PR.
- If a command is corrected after failures, record the final verified command here.
