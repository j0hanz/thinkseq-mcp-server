#!/usr/bin/env node
import { createRequire } from 'node:module';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { ThinkingEngine } from './engine.js';
import { registerAllTools } from './tools/index.js';

const require = createRequire(import.meta.url);
const pkg = require('../package.json') as { version: string };

const server = new McpServer(
  { name: 'thinkseq', version: pkg.version },
  {
    instructions: `ThinkSeq is a tool for structured, sequential thinking.
Use it to break down complex problems into steps, with support for branching and revision.
Each thought builds on previous ones. You can branch to explore alternatives or revise earlier thinking.`,
    capabilities: { logging: {} },
  }
);

const engine = new ThinkingEngine();
registerAllTools(server, engine);

// Graceful shutdown
process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));

// Start server
async function startServer(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('ThinkSeq MCP server running on stdio');
}

startServer().catch((err: unknown) => {
  console.error('Server error:', err);
  process.exit(1);
});
