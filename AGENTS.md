# AGENTS.md

> **Purpose:** Context and strict guidelines for AI agents working in this repository.

## 1. Project Context

- **Domain:** MCP (Model Context Protocol) stdio server that exposes a single `thinkseq` tool for structured, sequential thinking with revision (destructive rewind) support.
- **Tech Stack:**
  - **Language:** TypeScript (compiler: TypeScript 5.9.3)
  - **Runtime:** Node.js `>=20.0.0` (ESM; `"type": "module"`)
  - **Key Libraries:** `@modelcontextprotocol/sdk`, `zod`
- **Architecture:** Layered modules (CLI + app wiring → engine core → lib utilities → zod schemas → MCP tool registration).

## 2. Repository Map (High-Level Only)

- `src/`: Implementation (CLI entrypoint, MCP wiring, engine, schemas, tool registration).
- `tests/`: Node.js test runner tests (`node:test`) for behavior + characterization.
- `.github/workflows/`: CI/CD (publishing workflow).
- `benchmark/`: Benchmarks.
- `docs/`: Assets (e.g., logo).
- `scripts/`, `metrics/`: Quality gate helpers and metric snapshots.

> Note: Ignore `dist/`, `node_modules/` for source edits.

## 3. Operational Commands

- **Environment:** Node.js `>=20`.
- **Install:** `npm ci`
- **Dev Server:** `npm run dev` (watches `src/index.ts` via `tsx`)
- **Test:** `npm test` (runs `node --import tsx/esm --test tests/*.test.ts`)
- **Build:** `npm run build` (emits `dist/`)

Useful (also verified in `package.json`):

- **Lint:** `npm run lint`
- **Type-check:** `npm run type-check`
- **Start built output:** `npm start`

## 4. Coding Standards (Style & Patterns)

- **Module system:** ESM + NodeNext resolution. Local imports use `.js` extensions (even in TypeScript sources).
- **Typing:** Strict TypeScript (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`).
- **Naming:** `camelCase` for vars/functions, `PascalCase` for types/classes.
- **Exports:** Prefer named exports; avoid default exports.
- **Lint rules to respect:** No `any`; explicit return types on exported functions; prefer `import { type X }` for type-only.
- **Common patterns in code:**
  - Small pure helpers + early returns.
  - Conditional object spread (`...(cond && { key: value })`).
  - Private class fields via `#field`.

## 5. Agent Behavioral Rules (The “Do Nots”)

- **Prohibited:** Do not use `any`.
- **Prohibited:** Do not remove `.js` from local import specifiers.
- **Prohibited:** Do not introduce default exports.
- **Prohibited:** Do not write non-MCP output to stdout in stdio mode (use `console.error` for logs).
- **Prohibited:** Do not edit build artifacts (`dist/`) or dependencies (`node_modules/`).
- **Lockfiles:** Do not edit `package-lock.json` manually.
- **Secrets:** Never hardcode secrets or echo `.env` values.
- **Schema strictness:** Preserve Zod strictness (unknown keys should be rejected where schemas use `z.strictObject`).

## 6. Testing Strategy

- **Framework:** Node’s built-in test runner (`node:test`) + `node:assert/strict`.
- **Approach:** Unit + characterization tests that lock down output shapes (important for MCP tool output stability).

## 7. Evolution & Maintenance

- **Update Rule:** If you introduce new scripts, env vars, or conventions, propose an update to this file.
- **Common Pitfalls (verified):** `.github/workflows/publish.yml` runs `npm run maintainability` and `npm run duplication`, but these scripts are not present in `package.json`.
