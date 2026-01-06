# thinkseq-mcp-server

<img src="docs/logo.png" alt="Filesystem Context MCP Server Logo" width="175">

An MCP implementation for advanced reasoning and thinking sequences.

[![npm version](https://img.shields.io/npm/v/@j0hanz/thinkseq-mcp.svg)](https://www.npmjs.com/package/@j0hanz/thinkseq-mcp)

## One-Click Install

[![Install with NPX in VS Code](https://img.shields.io/badge/VS_Code-Install-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=thinkseq&inputs=%5B%5D&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40j0hanz%2Fthinkseq-mcp%40latest%22%5D%7D) [![Install with NPX in VS Code Insiders](https://img.shields.io/badge/VS_Code_Insiders-Install-24bfa5?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=thinkseq&inputs=%5B%5D&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40j0hanz%2Fthinkseq-mcp%40latest%22%5D%7D&quality=insiders)

[![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/install-mcp?name=thinkseq&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIkBqMGhhbnovdGhpbmtzZXEtbWNwQGxhdGVzdCJdfQ==)

## ✨ Features

This MCP server provides a powerful `thinkseq` tool that enables AI agents to maintain rigorous thinking sequences.

| Feature                    | Description                                                                             |
| :------------------------- | :-------------------------------------------------------------------------------------- |
| 🧠 **Sequential Thinking** | Break down complex problems into manageable steps with maintained context.              |
| 🌿 **Branching**           | Explore multiple solution paths simultaneously without losing track of the main thread. |
| 🔄 **Revision Support**    | Dynamically revise previous thoughts and conclusions based on new insights.             |
| 🏗️ **Structured Output**   | Returns structured data for better agent-reasoning loops.                               |

## 🎯 When to Use

Use `thinkseq` when the AI agent needs to:

- **Plan complex architectures** before writing code.
- **Analyze interdependent parameters** or conflicting information.
- **Debug tricky issues** where initial assumptions might need correction.
- **Determine feature prioritization** based on multiple constraints.
- **Structure a "Chain of Thought"** that is visible and reviewable.

## 🚀 Quick Start

The easiest way to use the server is via `npx`:

```bash
npx -y @j0hanz/thinkseq-mcp@latest
```

## 📦 Installation

### NPX (Recommended)

Add this configuration to your MCP client settings:

```json
{
  "thinkseq": {
    "command": "npx",
    "args": ["-y", "@j0hanz/thinkseq-mcp@latest"]
  }
}
```

### From Source

1. Clone the repository:

   ```bash
   git clone https://github.com/j0hanz/thinkseq-mcp-server.git
   cd thinkseq-mcp
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Build the server:

   ```bash
   npm run build
   ```

4. Start the server:

   ```bash
   npm start
   ```

## ⚙️ Configuration

The server currently does not require environment variables or command-line arguments for basic operation. It runs over stdio by default.

## 🔧 Tools

### `thinkseq`

Structured sequential thinking with branching and revision support.

| Parameter           | Type    | Required | Default | Description                                                               |
| :------------------ | :------ | :------- | :------ | :------------------------------------------------------------------------ |
| `thought`           | string  | ✅       | -       | Your current thinking step.                                               |
| `thoughtNumber`     | number  | ✅       | -       | Current thought number in sequence (starts at 1).                         |
| `totalThoughts`     | number  | ✅       | -       | Estimated total thoughts needed (can adjust).                             |
| `nextThoughtNeeded` | boolean | ✅       | -       | Whether another thought step is needed.                                   |
| `isRevision`        | boolean | ❌       | -       | Whether this revises previous thinking.                                   |
| `revisesThought`    | number  | ❌       | -       | Which thought number is being reconsidered.                               |
| `branchFromThought` | number  | ❌       | -       | Branching point thought number.                                           |
| `branchId`          | string  | ❌       | -       | Branch identifier.                                                        |
| `thoughtType`       | string  | ❌       | -       | Type: `analysis`, `hypothesis`, `verification`, `revision`, `conclusion`. |

**Returns:** A JSON result containing the processed thought data, which helps the agent maintain context.

**Example Input:**

```json
{
  "thought": "I need to break down the user's request into smaller tasks.",
  "thoughtNumber": 1,
  "totalThoughts": 3,
  "nextThoughtNeeded": true,
  "thoughtType": "analysis"
}
```

## 🔌 Client Configuration

<details>
<summary><b>VS Code</b></summary>

Add to your `mcp.json` (access via command palette: "MCP: Open Settings"):

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

## 🛠️ Development

### Prerequisites

- Node.js >= 20.0.0

### Scripts

| Command             | Description                                         |
| :------------------ | :-------------------------------------------------- |
| `npm run build`     | Compiles TypeScript to `dist/`.                     |
| `npm run dev`       | Runs the server in watch mode for development.      |
| `npm run test`      | Runs the test suite.                                |
| `npm run lint`      | Lints the codebase using ESLint.                    |
| `npm run inspector` | Launches the MCP Inspector for interactive testing. |

### Project Structure

```text
src/
├── app.ts          # Application setup
├── engine.ts       # Core thinking engine logic
├── index.ts        # Entry point
├── lib/            # Shared utilities
├── schemas/        # Zod input/output schemas
└── tools/          # Tool definitions (thinkseq.ts)
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
