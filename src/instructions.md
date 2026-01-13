# ThinkSeq MCP Server — AI Usage Instructions

Use this server to record sequential thinking steps to plan, reason, and debug. Prefer these tools over "remembering" state in chat.

## Operating Rules

- Keep thoughts atomic: one decision, calculation, or action per step.
- Use revisions to fix mistakes in the active chain instead of apologizing in chat.
- If request is vague, ask clarifying questions.

### Strategies

- **Discovery:** Read the tool output's `context` to see recent thoughts and available revision targets.
- **Action:** Use `thinkseq` to advance the reasoning chain or `revisesThought` to rewind and correct.

## Data Model

- **Thinking Step:** `thought` (text), `thoughtNumber` (int), `progress` (0-1), `isComplete` (bool)

## Workflows

### 1) Structured Reasoning

```text
thinkseq(thought="Plan: 1. check, 2. fix", totalThoughts=5) → Start chain
thinkseq(thought="Check passed, starting fix") → Progress chain
thinkseq(thought="Revised plan: use new API", revisesThought=1) → Correction
```

## Tools

### thinkseq

Record a concise thinking step (max 5000 chars). Be brief: capture only the essential insight, calculation, or decision.

- **Use when:** You need to structured reasoning, planning, or a decision log.
- **Args:**
  - `thought` (string, required): Your current thinking step.
  - `totalThoughts` (number, optional): Estimated total thoughts (1-25, default: 3).
  - `revisesThought` (number, optional): Revise a previous thought by number.
- **Returns:** `thoughtNumber`, `progress`, `isComplete`, `revisableThoughts`, `context` (history previews).

## Response Shape

Success: `{ "ok": true, "result": { ... } }`
Error: `{ "ok": false, "error": { "code": "...", "message": "..." } }`

### Common Errors

| Code                           | Meaning                                | Resolution                                |
| ------------------------------ | -------------------------------------- | ----------------------------------------- |
| `E_REVISION_TARGET_NOT_FOUND`  | Revision target ID does not exist      | Check `revisableThoughts` for valid IDs   |
| `E_REVISION_TARGET_SUPERSEDED` | Target thought was already overwritten | Revise the current active thought instead |
| `E_THINK`                      | Generic engine error                   | Check arguments and retry                 |

## Limits

- **Max Thoughts:** 25 (default estimate)
- **Max Length:** 5000 chars per thought

## Security

- Do not store credentials, secrets, or PII in thoughts. State is in-memory only but may be logged.
