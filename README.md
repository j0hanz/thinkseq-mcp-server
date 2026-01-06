# ThinkSeq MCP Server

<img src="docs/logo.png" alt="ThinkSeq MCP Server Logo" width="175" />

An MCP implementation for advanced reasoning and thinking sequences.

[![npm version](https://img.shields.io/npm/v/@j0hanz/thinkseq-mcp.svg)](https://www.npmjs.com/package/@j0hanz/thinkseq-mcp)

## One-click install

[![Install with NPX in VS Code](https://img.shields.io/badge/VS_Code-Install-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=thinkseq&inputs=%5B%5D&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40j0hanz%2Fthinkseq-mcp%40latest%22%5D%7D) [![Install with NPX in VS Code Insiders](https://img.shields.io/badge/VS_Code_Insiders-Install-24bfa5?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=thinkseq&inputs=%5B%5D&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40j0hanz%2Fthinkseq-mcp%40latest%22%5D%7D&quality=insiders)

[![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/install-mcp?name=thinkseq&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIkBqMGhhbnovdGhpbmtzZXEtbWNwQGxhdGVzdCJdfQ==)

## Overview

ThinkSeq provides a single MCP tool, `thinkseq`, for structured, sequential thinking with branching and revision support. The server runs over stdio and keeps an in-memory history of thoughts so it can return progress, branches, and a short context summary on each call.

## Quick start

```bash
npx -y @j0hanz/thinkseq-mcp@latest
```

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

Structured sequential thinking with branching and revision support.

### Input

| Field               | Type    | Required | Description                                                                |
| :------------------ | :------ | :------: | :------------------------------------------------------------------------- |
| `thought`           | string  |   yes    | Current thinking step (1 to 50000 chars).                                  |
| `thoughtNumber`     | number  |   yes    | Current thought number in sequence (1 to 10000).                           |
| `totalThoughts`     | number  |   yes    | Estimated total thoughts needed (1 to 10000).                              |
| `nextThoughtNeeded` | boolean |   yes    | Whether another thought step is needed.                                    |
| `isRevision`        | boolean |    no    | Marks this thought as a revision.                                          |
| `revisesThought`    | number  |    no    | Thought number being revised (must exist).                                 |
| `branchFromThought` | number  |    no    | Thought number to branch from (must exist).                                |
| `branchId`          | string  |    no    | Branch identifier (1 to 100 chars).                                        |
| `thoughtType`       | enum    |    no    | One of `analysis`, `hypothesis`, `verification`, `revision`, `conclusion`. |

### Output

The tool returns JSON with a success or error shape:

- Success: `{ ok: true, result: { ... } }`
- Error: `{ ok: false, error: { code, message } }`

Result fields:

| Field                  | Type     | Description                                          |
| :--------------------- | :------- | :--------------------------------------------------- |
| `thoughtNumber`        | number   | Stored thought number.                               |
| `totalThoughts`        | number   | Effective total thoughts (at least `thoughtNumber`). |
| `progress`             | number   | `thoughtNumber / totalThoughts` (0 to 1).            |
| `nextThoughtNeeded`    | boolean  | Mirrors input.                                       |
| `thoughtHistoryLength` | number   | Stored thought count after pruning.                  |
| `branches`             | string[] | Known branch IDs.                                    |
| `context`              | object   | Recent context summary (see below).                  |

Context fields:

| Field            | Type    | Description                                                              |
| :--------------- | :------ | :----------------------------------------------------------------------- |
| `recentThoughts` | array   | Up to the last 5 thoughts with `number`, `preview`, and optional `type`. |
| `currentBranch`  | string  | Latest thought branch ID (if any).                                       |
| `hasRevisions`   | boolean | Whether any revision has been recorded.                                  |

### Example

Input:

```json
{
  "thought": "Break down the problem into steps.",
  "thoughtNumber": 1,
  "totalThoughts": 3,
  "nextThoughtNeeded": true,
  "thoughtType": "analysis"
}
```

Output (success):

```json
{
  "ok": true,
  "result": {
    "thoughtNumber": 1,
    "totalThoughts": 3,
    "progress": 0.3333333333333333,
    "nextThoughtNeeded": true,
    "thoughtHistoryLength": 1,
    "branches": [],
    "context": {
      "recentThoughts": [
        {
          "number": 1,
          "preview": "Break down the problem into steps.",
          "type": "analysis"
        }
      ],
      "hasRevisions": false
    }
  }
}
```

## Behavior and validation

- Inputs are validated with Zod and unknown keys are rejected.
- The first thought must have `thoughtNumber` 1.
- `revisesThought` and `branchFromThought` must reference an existing thought number.
- Gaps in thought sequence are allowed but emit a diagnostics event.
- `totalThoughts` is adjusted up to at least `thoughtNumber`.
- The engine stores thoughts in memory and prunes when limits are exceeded:
  - `maxThoughts` default: 500 (cap 10000)
  - `maxMemoryBytes` default: 100 MB
  - `estimatedThoughtOverheadBytes` default: 200

## Diagnostics

This server publishes events via `node:diagnostics_channel`:

- `thinkseq:tool` for `tool.start` and `tool.end` events
- `thinkseq:lifecycle` for `lifecycle.started` and `lifecycle.shutdown`
- `thinkseq:engine` for `engine.sequence_gap`

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
