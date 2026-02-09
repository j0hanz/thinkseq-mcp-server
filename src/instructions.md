# ThinkSeq Instructions

> Guidance for the Agent: These instructions are available as a resource (`internal://instructions`) or prompt (`get-help`). Load them when you are unsure about tool usage.

## 1. Core Capability

- **Domain:** In-memory, sequential thinking with revision (destructive rewind) per session.
- **Primary Resources:** `Thoughts`, `RevisionChain`, `ProgressContext`.

## 2. The "Golden Path" Workflows (Critical)

_Describe the standard order of operations using ONLY tools that exist._

### Workflow A: Capture a reasoning chain

1. Call `thinkseq` with `thought` (optionally `totalThoughts`, `sessionId`).
2. Continue calling `thinkseq` for each step.
3. Read `progress` and `isComplete` from the output to know when to stop.
   > Constraint: Keep each step atomic; one decision per call.

### Workflow B: Revise a prior step

1. Call `thinkseq` to get the latest `revisableThoughts` list (returned in every response).
2. Call `thinkseq` again with `revisesThought` set to a valid entry from that list.
3. Continue from the revised step.
   > Constraint: Never guess `revisesThought`; always pick from `revisableThoughts`.

## 3. Tool Nuances & Gotchas

_Do NOT repeat JSON schema. Focus on behavior and pitfalls._

- **`thinkseq`**
  - **Purpose:** Append or revise a thought in the current session.
  - **Inputs:** `thought` (1–8000 chars), `totalThoughts` (1–25), `revisesThought` (int >= 1).
  - **Side effects:** Mutates in-memory thought history; revisions supersede the target and later active thoughts (destructive rewind).
  - **Defaults:** If `totalThoughts` is omitted, the engine uses 3 or the last active total.
  - **Compatibility:** Tool responses include JSON string content alongside structured content.

## 4. Error Handling Strategy

- **`E_REVISION_MISSING` / `E_REVISION_TARGET_NOT_FOUND`**: Fetch `revisableThoughts` and retry with a valid ID.
- **`E_THINK`**: Verify inputs and retry once.
- **`E_TIMEOUT`**: Reduce thought length.
