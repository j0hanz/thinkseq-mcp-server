# AGENTS.md

> Purpose: High-signal context and strict guidelines for AI agents working in this repository.

## 1) Project Context

- **Domain:** Thinking and reasoning engine for the Model Context Protocol (MCP).
- **Tech Stack (Verified):**
  - **Languages:** TypeScript 5.9.x, Node.js >=20.0.0 (engines field).
  - **Runtime:** Node.js Native Test Runner (`node:test`), `tsx` for execution.
  - **Key Libraries:** `@modelcontextprotocol/sdk` (protocol), `zod` (validation), `eslint` (linting).
- **Architecture:** Class-based Core (`ThinkingEngine`) with event-sourced state (`ThoughtStore`). Uses stdio transport for MCP communication.

## 2) Repository Map (High-Level)

- `src/`: Source root.
- `src/engine/`: Core domain logic (`ThinkingEngine`, `ThoughtStore`, `revision`).
- `src/tools/`: MCP tool definitions and handlers.
- `src/lib/`: Shared utilities (types, CLI parsing).
- `tests/`: Unit and integration tests using `node:test`.
- `benchmark/`: Performance benchmarks.
- `.github/workflows/`: CI/CD pipelines (Build & Publish).

## 3) Operational Commands (Verified)

- **Environment:** Node.js >=20 (npm).
- **Install:** `npm ci`
- **Dev:** `npm run dev` (Runs `tsx watch src/index.ts`)
- **Test:** `npm test` (Runs `node --import tsx/esm --test tests/*.test.ts`)
- **Coverage:** `npm run test:coverage`
- **Build:** `npm run build` (Cleans, compiles TSC, validates assets, and chmod)
- **Lint:** `npm run lint` (ESLint)
- **Type Check:** `npm run type-check` (TSC noEmit)
- **Format:** `npm run format` (Prettier)

## 4) Coding Standards (Style & Patterns)

- **Naming:**
  - Variables/Functions: `camelCase`.
  - Classes/Types: `PascalCase`.
  - Private fields: `#privateField` (native private fields observed).
- **Structure:**
  - Core logic resides in `src/engine`.
  - Entry point is `src/index.ts`.
- **Typing/Strictness:**
  - **Very Strict:** `tseslint.configs.strictTypeChecked` enabled.
  - **Prohibitions:** No `any`, no unused imports, strict boolean comparisons.
  - **Complexity:** Max complexity 10, max lines per function 30 (enforced by ESLint).
- **Patterns Observed:**
  - **Voiding Promises:** `void runCli().catch(fatal)` and `void describe(...)` in tests.
  - **Dependency Injection:** Config/dependencies passed via factory functions or constructors.
  - **Validation:** Zod schemas used for all tool inputs.

## 5) Agent Behavioral Rules (Do Nots)

- **Do not use `console.log`:** This is an MCP server communicating over stdio. Stray logs will break the protocol. Use `console.error` for logging/diagnostics.
- **Do not bypass lint rules:** The repo enforces high complexity limits (max 30 lines/function). Refactor code instead of disabling rules.
- **Do not introduce "any":** The strict usage is enforced by CI.
- **Do not commit generated files:** `dist/` is ignored.
- **Do not use external test runners:** Use `node:test` (native).

## 6) Testing Strategy (Verified)

- **Framework:** `node:test` (Native Node.js Test Runner) with `node:assert/strict`.
- **Where tests live:** `tests/*.test.ts`.
- **Approach:**
  - **Unit:** Heavy focus on `ThinkingEngine` logic (`tests/engine.test.ts`).
  - **Execution:** Tests run via `tsx/esm` loader to support TypeScript directly.
  - **Style:** `void describe(...)` and `void it(...)` pattern is strictly followed.

## 7) Common Pitfalls (Optional; Verified Only)

- **Stdio Corruption:** Printing to `stdout` breaks the JSON-RPC channel. Always write logs to `stderr`.
- **Complexity Violations:** Functions > 30 lines will fail linting. Break down logic into small helper functions.
- **Unused Variables:** `unused-imports` plugin is active and will fail the build. Underscore prefix (`_var`) is allowed for ignored vars.

## 8) Evolution Rules

- If conventions change, include an `AGENTS.md` update in the same PR.
- If a command is corrected after failures, record the final verified command here.
