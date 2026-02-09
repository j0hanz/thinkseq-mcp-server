# ThinkSeq Instructions

> Available as resource (`internal://instructions`) or prompt (`get-help`). Load when unsure about tool usage.

---

## CORE CAPABILITY

- Domain: In-memory, sequential thinking with revision (destructive rewind) per session.
- Primary Resources: `Thoughts`, `RevisionChain`, `ProgressContext`.
- Tools: `thinkseq` (WRITE)

---

## THE "GOLDEN PATH" WORKFLOWS (CRITICAL)

### WORKFLOW A: Capture a reasoning chain

1. Call `thinkseq` with: `{ "thought": "..." }` (optionally `totalThoughts`, `sessionId`).
2. Continue calling `thinkseq` for each step.
3. Read `progress` and `isComplete` from the output to know when to stop.
   NOTE: Keep each step atomic; one decision per call.

### WORKFLOW B: Revise a prior step

1. Call `thinkseq` to get the latest `revisableThoughts` list (returned in every response).
2. Call `thinkseq` again with `revisesThought` set to a valid entry from that list.
3. Continue from the revised step.
   NOTE: Never guess `revisesThought`; always pick from `revisableThoughts`.

---

## TOOL NUANCES & GOTCHAS

`thinkseq`

- Purpose: Append or revise a thought in the current session.
- Inputs: `thought` (1–8000 chars), `totalThoughts` (1–25), `revisesThought` (int ≥ 1).
- Side effects: Mutates in-memory thought history; revisions supersede the target and later active thoughts (destructive rewind).
- Defaults: If `totalThoughts` is omitted, the engine uses 3 or the last active total.
- Compatibility: Set `THINKSEQ_INCLUDE_TEXT_CONTENT=0` env var to omit JSON string content if needed.

---

## ERROR HANDLING STRATEGY

- `E_REVISION_MISSING` / `E_REVISION_TARGET_NOT_FOUND`: Fetch `revisableThoughts` and retry with a valid ID.
- `E_REVISION_TARGET_SUPERSEDED`: Target already superseded; pick an active thought from `revisableThoughts`.
- `E_THINK`: Verify inputs and retry once.
- `E_TIMEOUT`: Reduce thought length.

---

## RESOURCES

- `internal://instructions`: This document.
