# ThinkSeq MCP Server

<img src="docs/logo.png" alt="ThinkSeq MCP Server Logo" width="175" />

A minimal MCP server for structured, sequential thinking.

[![npm version](https://img.shields.io/npm/v/@j0hanz/thinkseq-mcp.svg)](https://www.npmjs.com/package/@j0hanz/thinkseq-mcp)

## One-click install

[![Install with NPX in VS Code](https://img.shields.io/badge/VS_Code-Install-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=thinkseq&inputs=%5B%5D&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40j0hanz%2Fthinkseq-mcp%40latest%22%5D%7D) [![Install with NPX in VS Code Insiders](https://img.shields.io/badge/VS_Code_Insiders-Install-24bfa5?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=thinkseq&inputs=%5B%5D&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40j0hanz%2Fthinkseq-mcp%40latest%22%5D%7D&quality=insiders)

[![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/install-mcp?name=thinkseq&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIkBqMGhhbnovdGhpbmtzZXEtbWNwQGxhdGVzdCJdfQ==)

## Overview

ThinkSeq provides a single MCP tool, `thinkseq`, for structured, sequential thinking. The server runs over stdio and keeps an in-memory history of thoughts so it can return progress and a short context summary on each call.

## Quick start

```bash
npx -y @j0hanz/thinkseq-mcp@latest
```

## CLI options

```bash
thinkseq --max-thoughts 500 --max-memory-mb 100
```

Available flags:

- `--max-thoughts <number>`: Max thoughts to keep in memory.
- `--max-memory-mb <number>`: Max memory (MB) for stored thoughts.
- `--shutdown-timeout-ms <number>`: Graceful shutdown timeout.
- `--package-read-timeout-ms <number>`: Package.json read timeout.
- `-h, --help`: Show help.

## MCP client configuration

Add this to your MCP client settings:

```json
{
  "mcpServers": {
    "thinkseq": {
      "command": "npx",
      "args": ["-y", "@j0hanz/thinkseq-mcp@latest"]
    }
  }
}
```

<details>
<summary><b>VS Code</b></summary>

Add to your `mcp.json` (command palette: "MCP: Open Settings"):

```json
{
  "mcpServers": {
    "thinkseq": {
      "command": "npx",
      "args": ["-y", "@j0hanz/thinkseq-mcp@latest"]
    }
  }
}
```

</details>

<details>
<summary><b>Claude Desktop</b></summary>

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "thinkseq": {
      "command": "npx",
      "args": ["-y", "@j0hanz/thinkseq-mcp@latest"]
    }
  }
}
```

</details>

<details>
<summary><b>Cursor</b></summary>

1. Go to **Cursor Settings** > **General** > **MCP**.
2. Click **Add New MCP Server**.
3. Fill in the details:
   - **Name:** `thinkseq`
   - **Type:** `command`
   - **Command:** `npx -y @j0hanz/thinkseq-mcp@latest`

</details>

<details>
<summary><b>Windsurf</b></summary>

Add to your `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "thinkseq": {
      "command": "npx",
      "args": ["-y", "@j0hanz/thinkseq-mcp@latest"]
    }
  }
}
```

</details>

## Tool: `thinkseq`

Record a concise thinking step. Be brief: capture only the essential insight, calculation, or decision—like a minimal draft, not a verbose explanation. Returns progress and last 5 thought previews.

### Input

| Field            | Type   | Required | Description                                                        |
| :--------------- | :----- | :------: | :----------------------------------------------------------------- |
| `thought`        | string |   yes    | Current thinking step (1–2000 chars).                              |
| `totalThoughts`  | number |    no    | Estimated total thoughts (1–25, default: 3).                       |
| `revisesThought` | number |    no    | Revise a previous thought by number. Original preserved for audit. |

### Output

The tool returns `structuredContent` with result fields directly.

Result fields:

| Field                  | Type     | Description                                          |
| :--------------------- | :------- | :--------------------------------------------------- |
| `thoughtNumber`        | number   | Auto-incremented thought number.                     |
| `totalThoughts`        | number   | Effective total thoughts (at least `thoughtNumber`). |
| `progress`             | number   | `thoughtNumber / totalThoughts` (0 to 1).            |
| `isComplete`           | boolean  | `true` when `thoughtNumber >= totalThoughts`.        |
| `thoughtHistoryLength` | number   | Stored thought count after pruning.                  |
| `hasRevisions`         | boolean  | `true` if any thought has been revised.              |
| `activePathLength`     | number   | Count of non-superseded thoughts.                    |
| `revisableThoughts`    | number[] | Thought numbers available for revision.              |
| `context`              | object   | Recent context summary (see below).                  |

Context fields:

| Field            | Type   | Description                                                            |
| :--------------- | :----- | :--------------------------------------------------------------------- |
| `recentThoughts` | array  | Up to the last 5 active thoughts with `number` and `preview`.          |
| `revisionInfo`   | object | Present when revising: `revises` (number) and `supersedes` (number[]). |

### Example

**Basic usage:**

Input:

```json
{
  "thought": "3 steps: parse → validate → transform"
}
```

Output (success):

```json
{
  "thoughtNumber": 1,
  "totalThoughts": 3,
  "progress": 0.3333333333333333,
  "isComplete": false,
  "thoughtHistoryLength": 1,
  "hasRevisions": false,
  "activePathLength": 1,
  "revisableThoughts": [1],
  "context": {
    "recentThoughts": [
      {
        "number": 1,
        "preview": "3 steps: parse → validate → transform"
      }
    ]
  }
}
```

**Revising a thought:**

If you realize an earlier step was wrong, use `revisesThought` to correct it:

Input:

```json
{
  "thought": "Better approach: validate first, then parse",
  "revisesThought": 1
}
```

Output:

```json
{
  "thoughtNumber": 2,
  "totalThoughts": 3,
  "progress": 0.6666666666666666,
  "isComplete": false,
  "thoughtHistoryLength": 2,
  "hasRevisions": true,
  "activePathLength": 1,
  "revisableThoughts": [2],
  "context": {
    "recentThoughts": [
      {
        "number": 2,
        "preview": "Better approach: validate first, then parse"
      }
    ],
    "revisionInfo": {
      "revises": 1,
      "supersedes": [1]
    }
  }
}
```

## Behavior and validation

- Inputs are validated with Zod and unknown keys are rejected.
- `thoughtNumber` is auto-incremented (1, 2, 3...).
- `totalThoughts` is adjusted up to at least `thoughtNumber`.
- The engine stores thoughts in memory and prunes when limits are exceeded:
  - `maxThoughts` default: 500 (cap 10000)
  - `maxMemoryBytes` default: 100 MB
  - `estimatedThoughtOverheadBytes` default: 200

## Diagnostics

This server publishes events via `node:diagnostics_channel`:

- `thinkseq:tool` for `tool.start` and `tool.end` events
- `thinkseq:lifecycle` for `lifecycle.started` and `lifecycle.shutdown`

## Configuration

No environment variables or CLI flags are required for basic operation. The server runs over stdio and enforces MCP initialization order and protocol version checks.

## Development

### Prerequisites

- Node.js >= 20.0.0

### Scripts

| Command                  | Description                                                 |
| :----------------------- | :---------------------------------------------------------- |
| `npm run build`          | Compile TypeScript to `dist/`.                              |
| `npm run dev`            | Run the server in watch mode.                               |
| `npm start`              | Run `dist/index.js`.                                        |
| `npm run test`           | Run the test suite.                                         |
| `npm run test:coverage`  | Run tests with coverage output.                             |
| `npm run lint`           | Lint with ESLint.                                           |
| `npm run format`         | Format with Prettier.                                       |
| `npm run format:check`   | Check formatting with Prettier.                             |
| `npm run type-check`     | Type-check without emitting.                                |
| `npm run inspector`      | Launch the MCP inspector.                                   |
| `npm run clean`          | Remove `dist/`.                                             |
| `npm run prepublishOnly` | Lint, type-check, and build.                                |
| `npm run benchmark`      | Run `benchmark/engine.bench.ts` (add the file to use this). |

### Project structure

```text
src/
  app.ts        # Application setup and MCP wiring
  engine.ts     # Core thinking engine
  index.ts      # Entry point
  lib/          # Diagnostics, package, error, protocol, stdio utilities
  schemas/      # Zod input/output schemas
  tools/        # Tool definitions (thinkseq)
tests/          # Node.js tests
benchmark/      # Benchmark targets (currently empty)
docs/           # Assets (logo)
dist/           # Build output
```

## Contributing

Contributions are welcome. Please open a pull request with a clear description and include relevant tests.
