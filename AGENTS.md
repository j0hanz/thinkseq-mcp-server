# AGENTS.md

> **Purpose:** Context and strict guidelines for AI agents working in this repository.

## 1. Project Context

- **Domain:** Model Context Protocol (MCP) server for a "Thinking Engine" (sequential reasoning with revisions).
- **Tech Stack:**
  - **Language:** TypeScript 5.9+ (NodeNext, ES2022)
  - **Runtime:** Node.js >=20
  - **Framework:** MCP SDK (`@modelcontextprotocol/sdk`)
  - **Key Libraries:** `zod` (validation), `tsx` (execution), `eslint` (quality)
- **Architecture:** Layered Architecture
  - **Core:** `src/engine/` (State management, logic)
  - **Interface:** `src/tools/` (MCP tool definitions)
  - **Entry:** `src/index.ts` -> `src/app.ts`

## 2. Repository Map (High-Level Only)

- `src/engine/`: Core logic for `ThinkingEngine`, `ThoughtStore`, and revision handling.
- `src/tools/`: MCP tool definitions and handlers.
- `src/lib/`: Shared utilities (logging, CLI, types).
- `tests/`: Unit and integration tests using Node.js native test runner.
- `benchmark/`: Performance benchmarks for the engine.
  > _Note: Ignore `dist`, `node_modules`, and `.git`._

## 3. Operational Commands

- **Install:** `npm install`
- **Dev Server:** `npm run dev` (uses `tsx watch`)
- **Test:** `npm test` (uses `node --test`)
- **Build:** `npm run build` (Clean -> Compile -> Validate -> Copy Assets)
- **Lint:** `npm run lint` (ESLint)
- **Type Check:** `npm run type-check` (TSC noEmit)
- **Format:** `npm run format` (Prettier)

## 4. Coding Standards (Style & Patterns)

- **Naming:** camelCase for vars/functions, PascalCase for classes/types, UPPER_CASE for constants.
- **Structure:**
  - Place core logic in `src/engine/`.
  - Place MCP tool definitions in `src/tools/`.
  - Use `src/lib/types.ts` for shared types.
- **Typing:** Strict TypeScript (`strict: true`, `noExplicitAny`). Prefer `type` imports.
- **Preferred Patterns:**
  - **Result Type:** Use `{ ok: true, result: T } | { ok: false, error: E }` for operations.
  - **Dependency Injection:** Pass dependencies via config objects (e.g., `RunDependencies`).
  - **Explicit Returns:** All functions must have explicit return types.
  - **Void Promises:** Explicitly `void` floating promises in tests and entry points.

## 5. Agent Behavioral Rules (The "Do Nots")

- **Prohibited:** Do not use `any` type (strictly enforced).
- **Prohibited:** Do not use public accessibility modifiers (default is public, rule `no-public` enforces omission).
- **Prohibited:** Do not use `console.log` for application logic; use `mcpLogging` or return values.
- **Handling Secrets:** Never output `.env` values or hardcode secrets.
- **File Creation:** Always verify folder existence before creating files.
- **Validation:** Always run `npm run type-check` before declaring a task complete.

## 6. Testing Strategy

- **Framework:** Node.js Native Test Runner (`node:test`, `node:assert/strict`).
- **Approach:**
  - Write unit tests in `tests/*.test.ts` mirroring `src/` structure.
  - Use `describe` and `it` blocks.
  - Assertions must use `assert/strict`.

## 7. Evolution & Maintenance

- **Update Rule:** If a convention changes or a new pattern is established, the agent MUST suggest an update to this file in the PR.
- **Feedback Loop:** If a build command fails twice, the correct fix MUST be recorded in the "Common Pitfalls" section.
