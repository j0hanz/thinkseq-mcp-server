# ThinkSeq Instructions

<!-- Path: [src/instructions.md](src/instructions.md) -->

> Guidance for the Agent: These instructions are available as a resource (`internal://instructions`) or prompt (`get-help`). Load them when you are unsure about tool usage.

## 1. Core Capability

- **Domain:** In-memory, sequential thinking with revision (destructive rewind) per session.
- **Primary Resources:** `Thoughts`, `RevisionChain`, `ProgressContext`.
- **Tools:**
  - **Read:** none.
  - **Write:** `thinkseq` (records and revises thoughts).

## 2. The "Golden Path" Workflows (Critical)

_Follow this order; do not guess indices._

### Workflow A: Capture a reasoning chain

1. Call `thinkseq` with `thought` (optionally `totalThoughts`, `sessionId`).
2. Continue calling `thinkseq` for each step.
3. Read `progress` and `isComplete` to know when to stop.
   > Constraint: Keep each step atomic; one decision per call.

### Workflow B: Revise a prior step

1. Call `thinkseq` to get the latest `revisableThoughts` list.
2. Call `thinkseq` again with `revisesThought` set to a valid entry.
3. Continue from the revised step.
   > Constraint: Never guess `revisesThought`; always pick from `revisableThoughts`.

## 3. Tool Nuances & Gotchas

_Do NOT repeat the JSON Schema. Focus on behavior and pitfalls._

- **`thinkseq`**
  - **Purpose:** Append or revise a thought in the current session.
  - **Inputs:** `thought` (1–8000 chars), `totalThoughts` (1–25), `sessionId` (1–200), `revisesThought` (int ≥ 1).
  - **Side effects:** Mutates in-memory thought history; revisions supersede the target and later active thoughts.
  - **Defaults:** If `totalThoughts` is omitted, the engine uses 3 or the last active total.
  - **Compatibility:** Set `THINKSEQ_INCLUDE_TEXT_CONTENT=0|false|no|off` to omit JSON string content.

## 4. Error Handling Strategy

- On `E_REVISION_MISSING` or `E_REVISION_TARGET_NOT_FOUND`, fetch `revisableThoughts` and retry.
- On `E_REVISION_TARGET_SUPERSEDED`, revise the latest active thought instead.
- On `E_THINK`, verify inputs and retry once.
