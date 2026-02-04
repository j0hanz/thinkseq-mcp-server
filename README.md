# ThinkSeq MCP Server

<img src="assets/logo.svg" alt="ThinkSeq MCP Server Logo" width="225" />

[![npm version](https://img.shields.io/npm/v/@j0hanz/thinkseq-mcp.svg)](https://www.npmjs.com/package/@j0hanz/thinkseq-mcp)[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)[![Powered by MCP](https://img.shields.io/badge/MCP-SDK-blue)](https://github.com/modelcontextprotocol/typescript-sdk)

[![Install with NPX in VS Code](https://img.shields.io/badge/VS_Code-Install-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=thinkseq&inputs=%5B%5D&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40j0hanz%2Fthinkseq-mcp%40latest%22%5D%7D) [![Install with NPX in VS Code Insiders](https://img.shields.io/badge/VS_Code_Insiders-Install-24bfa5?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=thinkseq&inputs=%5B%5D&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40j0hanz%2Fthinkseq-mcp%40latest%22%5D%7D&quality=insiders)

[![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/install-mcp?name=thinkseq&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIkBqMGhhbnovdGhpbmtzZXEtbWNwQGxhdGVzdCJdfQ==)

An MCP server for structured, sequential thinking with revision support.

## Overview

ThinkSeq exposes a single MCP tool, `thinkseq`, that enables Language Models to "think" in a structured, step-by-step manner. It maintains an in-memory history of thoughts, calculates progress, and critically allows for **destructive revision**—where a model can realize a mistake, "rewind" to a previous step, and branch off with a correction. This capability mirrors human reasoning patterns and improves problem-solving accuracy for complex tasks.

## Key Features

- **Sequential Thinking**: Records thoughts as discrete steps with auto-incrementing numbers.
- **Progress Tracking**: Automatically calculates progress (0.0 to 1.0) based on estimated total thoughts.
- **Revision Support**: Allows models to revise specific past thoughts, superseding the old path and starting a new reasoning branch.
- **Context Awareness**: Returns recent thoughts and revision context with every tool call to keep the model grounded.
- **Session Isolation**: Supports multiple concurrent thinking sessions via `sessionId`.
- **Memory Management**: Configurable limits for max thoughts and memory usage to prevent resource exhaustion.

## Tech Stack

- **Runtime**: Node.js >=22.0.0
- **Language**: TypeScript 5.9+
- **MCP SDK**: `@modelcontextprotocol/sdk`
- **Validation**: `zod`

## Repository Structure

```text
c:\thinkseq-mcp
├── dist/                 # Compiled JavaScript
├── src/
│   ├── app.ts            # Application entry and MCP wiring
│   ├── engine.ts         # Core thinking engine logic
│   ├── engineConfig.ts   # Configuration defaults
│   ├── index.ts          # CLI entrypoint
│   ├── lib/              # Utilities (CLI, logging, types)
│   ├── schemas/          # Zod schemas for inputs/outputs
│   └── tools/            # MCP tool definitions
├── package.json
└── tsconfig.json
```

## Requirements

- **Node.js**: Version 22.0.0 or higher.

## Quickstart

To run the server using `npx`:

```bash
npx -y @j0hanz/thinkseq-mcp@latest
```

<details>
<summary><b>Quick Test with MCP Inspector</b></summary>

You can inspect the tools using the MCP Inspector:

```bash
npx @modelcontextprotocol/inspector npx -y @j0hanz/thinkseq-mcp@latest
```

</details>

## Installation

### Using NPX (Recommended)

This server is designed to be run directly via `npx` in your MCP client configuration.

```bash
npx -y @j0hanz/thinkseq-mcp@latest
```

### From Source

1. Clone the repository:

   ```bash
   git clone https://github.com/j0hanz/thinkseq-mcp-server.git
   cd thinkseq-mcp-server
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Build the project:

   ```bash
   npm run build
   ```

4. Run the server:

   ```bash
   node dist/index.js
   ```

## Configuration

The server is configured via CLI arguments.

| Argument                             | Description                                   | Default |
| :----------------------------------- | :-------------------------------------------- | :------ |
| `--max-thoughts <number>`            | Max thoughts to keep in memory before pruning | 500     |
| `--max-memory-mb <number>`           | Max memory (MB) for stored thoughts           | 100     |
| `--shutdown-timeout-ms <number>`     | Graceful shutdown timeout in ms               | 5000    |
| `--package-read-timeout-ms <number>` | Package.json read timeout in ms               | 2000    |
| `-h, --help`                         | Show help message                             | -       |

## MCP Surface

### Tools

#### `thinkseq`

Record a concise thinking step. Be brief: capture only the essential insight, calculation, or decision.

**Parameters:**

| Name             | Type    | Required | Description                                                                                                           |
| :--------------- | :------ | :------: | :-------------------------------------------------------------------------------------------------------------------- |
| `thought`        | string  |   Yes    | Your current thinking step (1-8000 chars).                                                                            |
| `sessionId`      | string  |    No    | Optional session identifier (max 200 chars) to isolate thought histories.                                             |
| `totalThoughts`  | integer |    No    | Estimated total thoughts (1-25, default: 3).                                                                          |
| `revisesThought` | integer |    No    | Revise a previous thought by number. The original is preserved for audit, but the active chain rewinds to this point. |

**Returns:**

A JSON object containing the current state of the thinking process, including:

- `thoughtNumber`: The current step number.
- `progress`: A value between 0 and 1 indicating completion.
- `isComplete`: Boolean indicating if the thought process is finished.
- `revisableThoughts`: Array of thought numbers that can be revised.
- `context`: Recent thoughts and revision information.

**Example Input:**

```json
{
  "thought": "I need to calculate the fibonacci sequence up to 10.",
  "totalThoughts": 5
}
```

**Example Output:**

```json
{
  "ok": true,
  "result": {
    "thoughtNumber": 1,
    "totalThoughts": 5,
    "progress": 0.2,
    "isComplete": false,
    "revisableThoughts": [1],
    "context": {
      "recentThoughts": [
        {
          "stepIndex": 1,
          "number": 1,
          "preview": "I need to calculate the fibonacci sequence up to 10."
        }
      ]
    }
  }
}
```

### Resources

_No resources are currently exposed by this server._

### Prompts

_No prompts are currently exposed by this server._

## Client Configuration Examples

<details>
<summary><b>VS Code (mcp.json)</b></summary>

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

Add this to your `claude_desktop_config.json`:

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

1. Navigate to **Settings** > **General** > **MCP**.
2. Click **Add New MCP Server**.
3. Name: `thinkseq`
4. Type: `command`
5. Command: `npx -y @j0hanz/thinkseq-mcp@latest`

</details>

## Security

- **Stdio Transport**: This server runs over stdio. It creates a console bridge to intercept `console.log` calls and redirect them to standard error (stderr) to prevent interfering with the JSON-RPC protocol.
- **Memory Limits**: The server enforces maximum thought counts and memory usage limits (configurable via CLI) to prevent memory exhaustion attacks.
- **Input Validation**: All inputs are strictly validated using Zod schemas.

## Development Workflow

1. **Install dependencies**:

   ```bash
   npm install
   ```

2. **Run in development mode**:

   ```bash
   npm run dev      # Runs tsc in watch mode
   npm run dev:run  # Runs the built app in watch mode
   ```

3. **Run tests**:

   ```bash
   npm test
   ```

4. **Lint and Format**:

   ```bash
   npm run lint
   npm run format
   ```

## Contributing & License

This project is licensed under the MIT License.
