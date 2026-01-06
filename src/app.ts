import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { ThinkingEngine } from './engine.js';
import { publishLifecycleEvent } from './lib/diagnostics.js';
import type { LifecycleEvent } from './lib/diagnostics.js';
import type { PackageInfo } from './lib/package.js';
import { readSelfPackageJson } from './lib/package.js';
import { registerThinkSeq } from './tools/thinkseq.js';

const SERVER_INSTRUCTIONS = `ThinkSeq is a tool for structured, sequential thinking.
Use it to break down complex problems into steps, with support for branching and revision.
Each thought builds on previous ones. You can branch to explore alternatives or revise earlier thinking.`;

const DEFAULT_PACKAGE_READ_TIMEOUT_MS = 2000;

type Closeable = Record<string, unknown> & {
  close?: () => Promise<void> | void;
};

interface ProcessLike {
  on: (event: string, listener: (...args: unknown[]) => void) => void;
  exit: (code: number) => void;
}

type ServerLike = Pick<McpServer, 'connect' | 'registerTool'>;
type TransportLike = Pick<StdioServerTransport, 'close'>;
type EngineLike = Pick<ThinkingEngine, 'processThought'>;

export interface ProcessErrorHandlerDeps {
  processLike?: ProcessLike;
  logError?: (message: string) => void;
  exit?: (code: number) => void;
}

interface ShutdownDependencies {
  processLike?: ProcessLike;
  server: Closeable;
  transport: Closeable;
  publishLifecycleEvent?: (event: LifecycleEvent) => void;
  now?: () => number;
}

export interface RunDependencies {
  processLike?: ProcessLike;
  packageReadTimeoutMs?: number;
  readPackageJson?: (signal?: AbortSignal) => Promise<PackageInfo>;
  publishLifecycleEvent?: (event: LifecycleEvent) => void;
  createServer?: (name: string, version: string) => ServerLike;
  connectServer?: (server: ServerLike) => Promise<TransportLike>;
  registerTool?: (server: ServerLike, engine: EngineLike) => void;
  engineFactory?: () => EngineLike;
  installShutdownHandlers?: (deps: ShutdownDependencies) => void;
  now?: () => number;
}

type ResolvedRunDependencies = Required<RunDependencies>;

function createProcessErrorHandler(
  label: 'unhandledRejection' | 'uncaughtException',
  logError: (message: string) => void,
  exit: (code: number) => void
): (value: unknown) => void {
  return (value: unknown) => {
    const error = value instanceof Error ? value : new Error(String(value));
    const message = error.message;
    logError(`thinkseq: ${label}: ${message}`);
    exit(1);
  };
}

export function installProcessErrorHandlers(
  deps: ProcessErrorHandlerDeps = {}
): void {
  const proc = deps.processLike ?? process;
  const logError = deps.logError ?? console.error;
  const exit =
    deps.exit ??
    ((code: number) => {
      proc.exit(code);
    });

  proc.on(
    'unhandledRejection',
    createProcessErrorHandler('unhandledRejection', logError, exit)
  );
  proc.on(
    'uncaughtException',
    createProcessErrorHandler('uncaughtException', logError, exit)
  );
}

function createServer(name: string, version: string): ServerLike {
  return new McpServer(
    { name, version },
    {
      instructions: SERVER_INSTRUCTIONS,
      capabilities: { logging: {} },
    }
  );
}

async function connectServer(server: ServerLike): Promise<TransportLike> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  return transport;
}

function normalizePackageInfo(pkg: PackageInfo): {
  name: string;
  version: string;
} {
  return {
    name: pkg.name ?? 'thinkseq',
    version: pkg.version ?? '0.0.0',
  };
}

const DEFAULT_RUN_DEPENDENCIES: ResolvedRunDependencies = {
  processLike: process,
  packageReadTimeoutMs: DEFAULT_PACKAGE_READ_TIMEOUT_MS,
  readPackageJson: readSelfPackageJson,
  publishLifecycleEvent,
  createServer,
  connectServer,
  registerTool: registerThinkSeq,
  engineFactory: () => new ThinkingEngine(),
  installShutdownHandlers,
  now: Date.now,
};

function resolveRunDependencies(
  deps: RunDependencies
): ResolvedRunDependencies {
  return { ...DEFAULT_RUN_DEPENDENCIES, ...deps };
}

async function closeSafely(value: Closeable): Promise<void> {
  try {
    if (typeof value.close === 'function') {
      await value.close();
    }
  } catch (err) {
    void err;
  }
}

function installShutdownHandlers({
  processLike,
  server,
  transport,
  publishLifecycleEvent: publishLifecycle,
  now,
}: ShutdownDependencies): void {
  const proc = processLike ?? process;
  const emit = publishLifecycle ?? publishLifecycleEvent;
  const timestamp = now ?? Date.now;
  let shuttingDown = false;

  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;

    emit({
      type: 'lifecycle.shutdown',
      ts: timestamp(),
      signal,
    });

    await closeSafely(server);
    await closeSafely(transport);
    proc.exit(0);
  };

  proc.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
  proc.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
}

export async function run(deps: RunDependencies = {}): Promise<void> {
  const resolved = resolveRunDependencies(deps);

  const pkg = await resolved.readPackageJson(
    AbortSignal.timeout(resolved.packageReadTimeoutMs)
  );
  const { name, version } = normalizePackageInfo(pkg);

  resolved.publishLifecycleEvent({
    type: 'lifecycle.started',
    ts: resolved.now(),
  });

  const server = resolved.createServer(name, version);
  const engine = resolved.engineFactory();
  resolved.registerTool(server, engine);

  const transport = await resolved.connectServer(server);
  resolved.installShutdownHandlers({
    processLike: resolved.processLike,
    server,
    transport,
    publishLifecycleEvent: resolved.publishLifecycleEvent,
    now: resolved.now,
  });
}
