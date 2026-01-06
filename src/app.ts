import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { ThinkingEngine } from './engine.js';
import { publishLifecycleEvent } from './lib/diagnostics.js';
import type { LifecycleEvent } from './lib/diagnostics.js';
import type { PackageInfo } from './lib/package.js';
import { readSelfPackageJson } from './lib/package.js';
import { registerAllTools } from './tools/index.js';

const SERVER_INSTRUCTIONS = `ThinkSeq is a tool for structured, sequential thinking.
Use it to break down complex problems into steps, with support for branching and revision.
Each thought builds on previous ones. You can branch to explore alternatives or revise earlier thinking.`;

const DEFAULT_PACKAGE_READ_TIMEOUT_MS = 2000;

export interface Closeable {
  close?: () => Promise<void> | void;
}

export interface ProcessLike {
  on: (event: string, listener: (...args: unknown[]) => void) => void;
  exit: (code: number) => void;
}

export interface ProcessErrorHandlerDeps {
  processLike?: ProcessLike;
  logError?: (message: string) => void;
  exit?: (code: number) => void;
}

export interface ShutdownDependencies {
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
  createServer?: (name: string, version: string) => McpServer;
  connectServer?: (server: McpServer) => Promise<StdioServerTransport>;
  registerAllTools?: (server: McpServer, engine: ThinkingEngine) => void;
  engineFactory?: () => ThinkingEngine;
  installShutdownHandlers?: (deps: ShutdownDependencies) => void;
  now?: () => number;
}

interface ResolvedRunDependencies {
  processLike: ProcessLike;
  packageReadTimeoutMs: number;
  readPackageJson: (signal?: AbortSignal) => Promise<PackageInfo>;
  publishLifecycleEvent: (event: LifecycleEvent) => void;
  createServer: (name: string, version: string) => McpServer;
  connectServer: (server: McpServer) => Promise<StdioServerTransport>;
  registerAllTools: (server: McpServer, engine: ThinkingEngine) => void;
  engineFactory: () => ThinkingEngine;
  installShutdownHandlers: (deps: ShutdownDependencies) => void;
  now: () => number;
}

function createProcessErrorHandler(
  label: 'unhandledRejection' | 'uncaughtException',
  logError: (message: string) => void,
  exit: (code: number) => void
): (value: unknown) => void {
  return (value: unknown) => {
    const message = value instanceof Error ? value.message : String(value);
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

export function normalizePackageInfo(pkg: PackageInfo): {
  name: string;
  version: string;
} {
  return {
    name: pkg.name ?? 'thinkseq',
    version: pkg.version ?? '0.0.0',
  };
}

export function createServer(name: string, version: string): McpServer {
  return new McpServer(
    { name, version },
    {
      instructions: SERVER_INSTRUCTIONS,
      capabilities: { logging: {} },
    }
  );
}

export async function connectServer(
  server: McpServer
): Promise<StdioServerTransport> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  return transport;
}

export async function tryClose(value: Closeable): Promise<void> {
  if (typeof value.close === 'function') {
    await value.close();
  }
}

export function installShutdownHandlers({
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
    proc.exit(0);
  };

  proc.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
  proc.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
}

function resolveRunDependencies(
  deps: RunDependencies
): ResolvedRunDependencies {
  const processLike = withDefault(deps.processLike, process);
  const packageReadTimeoutMs = withDefault(
    deps.packageReadTimeoutMs,
    DEFAULT_PACKAGE_READ_TIMEOUT_MS
  );
  const readPackageJson = withDefault(
    deps.readPackageJson,
    readSelfPackageJson
  );
  const publishLifecycle = withDefault(
    deps.publishLifecycleEvent,
    publishLifecycleEvent
  );
  const create = withDefault(deps.createServer, createServer);
  const connect = withDefault(deps.connectServer, connectServer);
  const registerTools = withDefault(deps.registerAllTools, registerAllTools);
  const engineFactory = withDefault(
    deps.engineFactory,
    () => new ThinkingEngine()
  );
  const installShutdown = withDefault(
    deps.installShutdownHandlers,
    installShutdownHandlers
  );
  const now = withDefault(deps.now, Date.now);
  return {
    processLike,
    packageReadTimeoutMs,
    readPackageJson,
    publishLifecycleEvent: publishLifecycle,
    createServer: create,
    connectServer: connect,
    registerAllTools: registerTools,
    engineFactory,
    installShutdownHandlers: installShutdown,
    now,
  };
}

function withDefault<T>(value: T | undefined, fallback: T): T {
  return value ?? fallback;
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
  resolved.registerAllTools(server, engine);

  const transport = await resolved.connectServer(server);
  resolved.installShutdownHandlers({
    processLike: resolved.processLike,
    server,
    transport,
    publishLifecycleEvent: resolved.publishLifecycleEvent,
    now: resolved.now,
  });
}
