# ThinkSeq Instructions

> **Guidance for the Agent:** These instructions are available as a resource (`internal://instructions`).

## 1. Core Capability

- **Domain:** In-memory, sequential thinking with revision (destructive rewind).
- **Primary Resources:** `Thoughts`, `RevisionChain`, `ProgressContext`.

## 2. The "Golden Path" Workflows (Critical)

_Follow this order; do not guess indices._

### Workflow A: Capture a reasoning chain

1. Call `thinkseq` with `thought` (and optionally `totalThoughts`).
2. Continue calling `thinkseq` for each step.
3. Read `progress` and `isComplete` from the response to know when to stop.
   > **Constraint:** Keep each step atomic; one decision per call.

### Workflow B: Revise a prior step

1. Call `thinkseq` to get the latest `revisableThoughts` list.
2. Call `thinkseq` again with `revisesThought` set to a valid entry.
3. Continue from the revised step.
   > **Constraint:** Never guess `revisesThought`; always pick from `revisableThoughts`.

## 3. Tool Nuances & "Gotchas"

_Do NOT repeat the JSON Schema. Focus on behavior._

- **`thinkseq`**:
  - **Side Effects:** Mutates in-memory thought history (write operation).
  - **Limits:** `thought` max 8000 chars; `totalThoughts` max 25.
  - **Revisions:** Revising a thought supersedes that step and all later active steps.
  - **Compatibility:** Set `THINKSEQ_INCLUDE_TEXT_CONTENT=0|false|no|off` to omit the JSON string in `content`.

## 4. Error Handling Strategy

- If `E_REVISION_TARGET_NOT_FOUND`, fetch a fresh `revisableThoughts` list and retry.
- If `E_REVISION_TARGET_SUPERSEDED`, revise the latest active thought instead.
- If `E_THINK`, verify inputs and retry once.
