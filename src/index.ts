#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { ThinkingEngine } from './engine.js';
import { publishLifecycleEvent } from './lib/diagnostics.js';
import type { PackageInfo } from './lib/package.js';
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

const SERVER_INSTRUCTIONS = `ThinkSeq is a tool for structured, sequential thinking.
Use it to break down complex problems into steps, with support for branching and revision.
Each thought builds on previous ones. You can branch to explore alternatives or revise earlier thinking.`;

const PACKAGE_READ_TIMEOUT_MS = 2000;

function normalizePackageInfo(pkg: PackageInfo): {
  name: string;
  version: string;
} {
  return {
    name: pkg.name ?? 'thinkseq',
    version: pkg.version ?? '0.0.0',
  };
}

function createServer(name: string, version: string): McpServer {
  return new McpServer(
    { name, version },
    {
      instructions: SERVER_INSTRUCTIONS,
      capabilities: { logging: {} },
    }
  );
}

async function connectServer(server: McpServer): Promise<StdioServerTransport> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  return transport;
}

function installShutdownHandlers(
  server: McpServer,
  transport: StdioServerTransport
): void {
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

async function main(): Promise<void> {
  const pkg = await readSelfPackageJson(
    AbortSignal.timeout(PACKAGE_READ_TIMEOUT_MS)
  );
  const { name, version } = normalizePackageInfo(pkg);

  publishLifecycleEvent({ type: 'lifecycle.started', ts: Date.now() });

  const server = createServer(name, version);
  const engine = new ThinkingEngine();
  registerAllTools(server, engine);

  const transport = await connectServer(server);
  installShutdownHandlers(server, transport);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`thinkseq: fatal: ${message}`);
  process.exit(1);
});
