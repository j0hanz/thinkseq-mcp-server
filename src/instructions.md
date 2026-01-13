# ThinkSeq MCP Server — Instructions

## What this server does

ThinkSeq exposes one MCP tool, `thinkseq`, to help you keep a short, numbered chain of reasoning steps with progress tracking and revision support.

- State is in-memory only and resets when the server restarts.
- Keep each step concise; this is a structure/coordination tool, not a scratchpad for long text.

## Available tools

### `thinkseq`

Record a single sequential thinking step.

**Use it when:**

- You want a small, explicit plan (step-by-step) and a progress signal.
- You want a lightweight decision log (assumptions → choice → next action).
- You are debugging and want a clear hypothesis → check → result chain.

**Do not use it for:**

- Long-form writing or dumping large transcripts.
- Storing secrets, credentials, or personal data.

**Inputs:**

- `thought` (string, 1–5000 chars, required): one concise step.
- `totalThoughts` (int, 1–25, optional): estimated total steps (default: 3).
- `revisesThought` (int ≥ 1, optional): revise a previous step by its `thoughtNumber`.

**Revision semantics (important):**

- A revision is a destructive rewind of the _active chain_.
- When you set `revisesThought`, the tool supersedes the targeted thought and every later _active_ thought, then continues from your corrected step.
- Superseded thoughts remain in history for audit, but they are no longer in the active chain.

**Outputs (prefer `structuredContent`):**

- `result.progress` in [0, 1] and `result.isComplete`
- `result.revisableThoughts`: thought numbers you can revise
- `result.context.recentThoughts`: previews of the current active chain
- `result.context.revisionInfo`: present only when a revision occurred

## Recommended workflow

1. Set `totalThoughts` once at the start (adjust later if needed).
2. Call `thinkseq` once per step; keep `thought` focused (one decision, one calculation, or one next action).
3. If you discover an earlier mistake, call `thinkseq` again with `revisesThought` to correct it.
4. Stop using the tool when `isComplete` becomes `true` (or once you have enough structure to proceed).

## Response handling guidance

- Don’t paste raw tool JSON to the user unless they ask.
- Use the tool output to write a clean, user-facing summary and next steps.

## Common errors

- `E_REVISION_TARGET_NOT_FOUND`: the target thought number doesn’t exist.
- `E_REVISION_TARGET_SUPERSEDED`: the target thought is no longer active.
- `E_THINK`: unexpected server-side failure.

## Optional configuration

- `THINKSEQ_INCLUDE_TEXT_CONTENT`: when set to `0`/`false`/`no`/`off`, the tool returns no `content` text and you should rely on `structuredContent`.
