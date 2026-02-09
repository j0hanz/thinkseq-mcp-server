# ThinkSeq MCP Server

[![npm version](https://img.shields.io/npm/v/@j0hanz/thinkseq-mcp)](https://www.npmjs.com/package/@j0hanz/thinkseq-mcp) [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT) [![Node.js](https://img.shields.io/badge/Node.js-%3E%3D24-green)](https://nodejs.org) [![TypeScript](https://img.shields.io/badge/TypeScript-5.9%2B-blue)](https://www.typescriptlang.org) [![MCP SDK](https://img.shields.io/badge/MCP%20SDK-%5E1.26-purple)](https://modelcontextprotocol.io)

[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install_Server-0078d7?logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect?url=vscode%3Amcp%2Finstall%3F%7B%22name%22%3A%22thinkseq%22%2C%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40j0hanz%2Fthinkseq-mcp%40latest%22%5D%7D) [![Install in VS Code Insiders](https://img.shields.io/badge/VS_Code_Insiders-Install_Server-24bfa5?logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect?url=vscode-insiders%3Amcp%2Finstall%3F%7B%22name%22%3A%22thinkseq%22%2C%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40j0hanz%2Fthinkseq-mcp%40latest%22%5D%7D)

A thinking and reasoning engine for the Model Context Protocol (MCP). Enables AI assistants to capture structured, sequential reasoning chains with full revision (destructive rewind) support, session isolation, and progress tracking.

---

## Overview

ThinkSeq provides an MCP server that exposes a single `thinkseq` tool for recording concise thinking steps. Each step is stored in-memory within isolated sessions, and the engine supports revising earlier steps — superseding the target and all subsequent active thoughts while preserving the full audit trail. The server communicates exclusively over **stdio** transport.

---

## Key Features

- **Sequential thinking steps** — Record atomic reasoning steps (up to 8,000 characters each) in order
- **Destructive revision (rewind)** — Revise any active thought; the target and all later thoughts are superseded, continuing from the corrected step
- **Session isolation** — Multiple independent thought histories via session IDs with pinned LRU eviction (default: 50 sessions)
- **Progress tracking** — Automatic `progress` (0–1) and `isComplete` signals returned with every response

---

## Tech Stack

| Component       | Technology                               |
| --------------- | ---------------------------------------- |
| Runtime         | Node.js ≥ 24                             |
| Language        | TypeScript 5.9+                          |
| MCP SDK         | `@modelcontextprotocol/sdk` ^1.26.0      |
| Validation      | `zod` ^4.3.6                             |
| Test framework  | Native Node.js Test Runner (`node:test`) |
| Package manager | npm                                      |

---

## Architecture

1. **CLI** parses arguments (`--max-thoughts`, `--max-memory-mb`, etc.)
2. **`run()`** resolves dependencies and reads `package.json` for server identity
3. **McpServer** is created with embedded instructions, the `thinkseq` tool, `internal://instructions` resource, and `get-help` prompt
4. **StdioServerTransport** connects the server (stdio only)
5. **Stdio guards** are installed: initialization enforcement, invalid message rejection, parse error responder
6. **Shutdown handlers** listen for `SIGTERM`/`SIGINT` and gracefully close server, engine, and transport within a configurable timeout

---

## Repository Structure

```
thinkseq-mcp/
├── src/
│   ├── appConfig/        # Environment, run dependencies, shutdown, types
│   ├── engine/           # Revision logic, thought queries, thought store
│   ├── lib/              # CLI, context, diagnostics, errors, MCP logging, stdio guards
│   ├── schemas/          # Zod input/output schemas
│   ├── tools/            # MCP tool registration (thinkseq)
│   ├── app.ts            # Core application wiring and lifecycle
│   ├── engine.ts         # ThinkingEngine class (session management, processing)
│   ├── engineConfig.ts   # Engine constants and defaults
│   ├── index.ts          # Entry point (CLI → run)
│   └── instructions.md   # Server instructions (bundled as resource/prompt)
├── tests/                # Unit and integration tests
├── scripts/
│   └── tasks.mjs         # Custom build/test task runner
├── assets/
│   └── logo.svg          # Server icon
├── package.json
└── tsconfig.json
```

---

## Requirements

- **Node.js** ≥ 24
- **npm** (included with Node.js)

---

## Quickstart

```bash
npx -y @j0hanz/thinkseq-mcp@latest
```

Add to your MCP client configuration:

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

---

## Installation

### NPX (recommended)

```bash
npx -y @j0hanz/thinkseq-mcp@latest
```

### Global Install

```bash
npm install -g @j0hanz/thinkseq-mcp
thinkseq
```

### From Source

```bash
git clone https://github.com/j0hanz/thinkseq-mcp-server.git
cd thinkseq-mcp-server
npm install
npm run build
npm start
```

---

## Configuration

### CLI Arguments

| Flag                                 | Type   | Description                         |
| ------------------------------------ | ------ | ----------------------------------- |
| `--max-thoughts <number>`            | number | Max thoughts to keep in memory      |
| `--max-memory-mb <number>`           | number | Max memory (MB) for stored thoughts |
| `--shutdown-timeout-ms <number>`     | number | Graceful shutdown timeout (ms)      |
| `--package-read-timeout-ms <number>` | number | Package.json read timeout (ms)      |
| `-h`, `--help`                       | flag   | Show help text                      |

### Engine Defaults

| Parameter                 | Default  | Max    |
| ------------------------- | -------- | ------ |
| Max thoughts per session  | 500      | 10,000 |
| Max memory                | 100 MB   | —      |
| Thought overhead estimate | 200 B    | —      |
| Max sessions (LRU)        | 50       | 10,000 |
| Default total thoughts    | 3        | 25     |
| Default shutdown timeout  | 5,000 ms | —      |
| Package read timeout      | 2,000 ms | —      |

### Environment Variables

| Variable                        | Default | Description                                                                    |
| ------------------------------- | ------- | ------------------------------------------------------------------------------ |
| `THINKSEQ_INCLUDE_TEXT_CONTENT` | `true`  | Set to `0`, `false`, `no`, or `off` to omit JSON string content from responses |

---

## Usage

### stdio (default and only transport)

```bash
# Direct
npx -y @j0hanz/thinkseq-mcp@latest

# With options
npx -y @j0hanz/thinkseq-mcp@latest --max-thoughts 1000 --max-memory-mb 200
```

---

## MCP Surface

### Tools

#### `thinkseq`

Record a concise thinking step. Supports sequential appending and destructive revision of prior steps.

**Parameters:**

| Name             | Type   | Required | Default     | Description                                                                |
| ---------------- | ------ | -------- | ----------- | -------------------------------------------------------------------------- |
| `thought`        | string | Yes      | —           | Your current thinking step (1–8,000 characters)                            |
| `sessionId`      | string | No       | `"default"` | Session identifier to isolate thought histories (1–200 chars)              |
| `totalThoughts`  | number | No       | `3`         | Estimated total thoughts (1–25)                                            |
| `revisesThought` | number | No       | —           | Revise a previous thought by number (≥ 1). Original is preserved for audit |

**Returns** (structured output):

```json
{
  "ok": true,
  "result": {
    "thoughtNumber": 1,
    "totalThoughts": 3,
    "progress": 0.333,
    "isComplete": false,
    "thoughtHistoryLength": 1,
    "hasRevisions": false,
    "activePathLength": 1,
    "revisableThoughts": [1],
    "revisableThoughtsTotal": 1,
    "context": {
      "recentThoughts": [
        {
          "stepIndex": 1,
          "number": 1,
          "preview": "First step of reasoning..."
        }
      ]
    }
  }
}
```

**Revision example:**

```json
{
  "thought": "Better approach: use caching instead",
  "revisesThought": 2
}
```

Returns additional `revisionInfo` in `context`:

```json
{
  "context": {
    "recentThoughts": [...],
    "revisionInfo": {
      "revises": 2,
      "supersedes": [2, 3],
      "supersedesTotal": 2
    }
  }
}
```

**Error codes:**

| Code                           | Description                                |
| ------------------------------ | ------------------------------------------ |
| `E_THINK`                      | General processing error                   |
| `E_REVISION_MISSING`           | `revisesThought` required but not provided |
| `E_REVISION_TARGET_NOT_FOUND`  | Target thought number does not exist       |
| `E_REVISION_TARGET_SUPERSEDED` | Target thought was already superseded      |

### Resources

| URI                       | MIME Type       | Description               |
| ------------------------- | --------------- | ------------------------- |
| `internal://instructions` | `text/markdown` | Server usage instructions |

### Prompts

| Name       | Description                            |
| ---------- | -------------------------------------- |
| `get-help` | Get usage instructions for this server |

---

## Client Configuration Examples

<details>
<summary>VS Code / VS Code Insiders</summary>

Add to your VS Code MCP settings (`.vscode/mcp.json` or User Settings):

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
<summary>Claude Desktop</summary>

Add to `claude_desktop_config.json`:

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
<summary>Cursor</summary>

Add to Cursor MCP settings:

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

Or use the deeplink:

```
cursor://anysphere.cursor-deeplink/mcp/install?name=thinkseq&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIkBqMGhhbnovdGhpbmtzZXEtbWNwQGxhdGVzdCJdfQ==
```

</details>

<details>
<summary>Windsurf</summary>

Add to `~/.codeium/windsurf/mcp_config.json`:

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

---

## Security

### stdio Transport

- **stdout protection:** `console.log` and `console.warn` are bridged to MCP logging messages to prevent polluting the JSON-RPC stdio channel.
- **Initialization enforcement:** The server rejects any request before a valid `initialize` handshake and requires `notifications/initialized` before accepting tool calls.
- **Invalid message rejection:** Non-object and batch JSON-RPC messages are rejected with proper error codes.
- **Parse error handling:** Malformed JSON on stdin receives a JSON-RPC Parse Error response.

### Process Safety

- Unhandled rejections and uncaught exceptions are caught and result in a clean process exit.
- Graceful shutdown on `SIGTERM`/`SIGINT` with configurable timeout (default: 5 seconds).

---

## Development Workflow

### Install Dependencies

```bash
npm install
```

### Scripts

| Script          | Command                                      | Purpose                                                           |
| --------------- | -------------------------------------------- | ----------------------------------------------------------------- |
| `dev`           | `tsc --watch --preserveWatchOutput`          | Watch mode TypeScript compilation                                 |
| `dev:run`       | `node --env-file=.env --watch dist/index.js` | Run built server with auto-reload                                 |
| `build`         | `node scripts/tasks.mjs build`               | Full build pipeline (clean → compile → validate → assets → chmod) |
| `start`         | `node dist/index.js`                         | Run the built server                                              |
| `test`          | `node scripts/tasks.mjs test`                | Run all tests (builds first)                                      |
| `test:coverage` | `node scripts/tasks.mjs test --coverage`     | Run tests with coverage                                           |
| `type-check`    | `node scripts/tasks.mjs type-check`          | TypeScript type checking                                          |
| `lint`          | `eslint .`                                   | Run ESLint                                                        |
| `lint:fix`      | `eslint . --fix`                             | Auto-fix lint issues                                              |
| `format`        | `prettier --write .`                         | Format code with Prettier                                         |
| `clean`         | `node scripts/tasks.mjs clean`               | Remove dist and build info files                                  |
| `inspector`     | `npx @modelcontextprotocol/inspector`        | Launch MCP Inspector for debugging                                |
| `knip`          | `knip`                                       | Detect unused exports/dependencies                                |

---

## Build and Release

The build pipeline (`npm run build`) executes:

1. **Clean** — Remove `dist/` and `.tsbuildinfo` files
2. **Compile** — TypeScript compilation via `tsconfig.build.json`
3. **Validate** — Ensure `src/instructions.md` exists
4. **Copy assets** — Bundle `instructions.md` and `assets/` (including `logo.svg`) into `dist/`
5. **Make executable** — Set `dist/index.js` to mode `755`

### Publishing

Publishing is automated via GitHub Actions (`.github/workflows/publish.yml`):

- Triggered on GitHub release publication
- Pipeline: lint → type-check → test → coverage → build → `npm publish --access public`
- Uses npm Trusted Publishing (OIDC) for authentication

---

## Troubleshooting

### MCP Inspector

Use the MCP Inspector to debug and test the server interactively:

```bash
npx @modelcontextprotocol/inspector
```

### Common Issues

| Issue                                              | Solution                                                                                             |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Server not responding                              | Ensure Node.js ≥ 24 is installed; check `node --version`                                             |
| `initialize must be first request`                 | Client must send `initialize` before any other request                                               |
| `notifications/initialized must follow initialize` | Client must send `notifications/initialized` after successful `initialize`                           |
| Thoughts disappearing                              | Check `--max-thoughts` and `--max-memory-mb` limits; old thoughts are pruned when limits are reached |
| Session not found                                  | Sessions are in-memory only; they reset on server restart. Max 50 sessions by default (LRU eviction) |

### stdout/stderr Guidance

When running as a stdio MCP server, **never write directly to stdout** from custom code — this would corrupt the JSON-RPC protocol. The server automatically bridges `console.log`/`console.warn` to MCP logging. Use `console.error` for debug output that bypasses MCP.

---

## License

[MIT](https://opensource.org/licenses/MIT)
