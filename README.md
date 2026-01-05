# ThinkSeq MCP Server

An MCP implementation for advanced reasoning and thinking sequences.

## Features

- **Smart Context**: Returns optimized context to the LLM (last 5 thoughts + branch info).
- **Structured Output**: Full Zod schema validation.
- **Zero Dependencies**: Only uses standard MCP SDK.
- **Branching & Revision**: Full support for non-linear thinking.

## Usage

This server provides one tool: `thinkseq`.

### Input Parameters

- `thought`: The thinking step content.
- `thoughtNumber`: Current step (1-indexed).
- `totalThoughts`: Estimated total steps.
- `nextThoughtNeeded`: Boolean.
- `thoughtType`: (Optional) "analysis", "hypothesis", "verification", etc.

## Development

```bash
npm install
npm run build
npm start
```

## Testing

```bash
npm test
```
