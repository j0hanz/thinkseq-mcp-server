#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { ThinkingEngine } from './engine.js';
import { publishLifecycleEvent } from './lib/diagnostics.js';
import { readSelfPackageJson } from './lib/package.js';
import { registerAllTools } from './tools/index.js';

// Process error handlers - must be registered early
process.on('unhandledRejection', (reason: unknown) => {
  const message = reason instanceof Error ? reason.message : String(reason);
  console.error(`thinkseq: unhandledRejection: ${message}`);
  process.exit(1);
});

process.on('uncaughtException', (error: Error) => {
  console.error(`thinkseq: uncaughtException: ${error.message}`);
  process.exit(1);
});

const tryClose = async (value: unknown): Promise<void> => {
  const maybeClose = value as { close?: () => Promise<void> | void };
  if (typeof maybeClose.close === 'function') {
    await maybeClose.close();
  }
};

const PACKAGE_READ_TIMEOUT_MS = 2000;

async function main(): Promise<void> {
  const pkg = await readSelfPackageJson(
    AbortSignal.timeout(PACKAGE_READ_TIMEOUT_MS)
  );
  const name = pkg.name ?? 'thinkseq';
  const version = pkg.version ?? '0.0.0';

  publishLifecycleEvent({ type: 'lifecycle.started', ts: Date.now() });

  const server = new McpServer(
    { name, version },
    {
      instructions: `ThinkSeq is a tool for structured, sequential thinking.
Use it to break down complex problems into steps, with support for branching and revision.
Each thought builds on previous ones. You can branch to explore alternatives or revise earlier thinking.`,
      capabilities: { logging: {} },
    }
  );

  const engine = new ThinkingEngine();
  registerAllTools(server, engine);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;

    publishLifecycleEvent({
      type: 'lifecycle.shutdown',
      ts: Date.now(),
      signal,
    });

    try {
      await tryClose(server);
    } catch {
      // Never crash on shutdown.
    }
    try {
      await tryClose(transport);
    } catch {
      // Never crash on shutdown.
    }
    process.exit(0);
  };

  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`thinkseq: fatal: ${message}`);
  process.exit(1);
});
