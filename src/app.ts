import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { publishLifecycleEvent } from './lib/diagnostics.js';
import type { LifecycleEvent } from './lib/diagnostics.js';
import type { PackageInfo } from './lib/package.js';
import { readSelfPackageJson } from './lib/package.js';
import { installInitializationGuards } from './lib/protocolGuards.js';
import {
  installStdioInvalidMessageGuards,
  installStdioParseErrorResponder,
} from './lib/stdioGuards.js';
import type { ProcessResult, ThoughtData } from './lib/types.js';
import { WorkerEngineClient } from './lib/workerEngineClient.js';
import { registerThinkSeq } from './tools/thinkseq.js';

const SERVER_INSTRUCTIONS =
  'ThinkSeq is a tool for structured, sequential thinking with branching and revision support.';

const DEFAULT_PACKAGE_READ_TIMEOUT_MS = 2000;
const DEFAULT_SHUTDOWN_TIMEOUT_MS = 5000;

type CloseFn = () => Promise<void> | void;

function hasClose(value: unknown): value is { close: CloseFn } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'close' in value &&
    typeof (value as { close?: unknown }).close === 'function'
  );
}

interface ProcessLike {
  on: (event: string, listener: (...args: unknown[]) => void) => void;
  exit: (code: number) => void;
}

interface ServerLike {
  connect: McpServer['connect'];
  registerTool: McpServer['registerTool'];
}

interface TransportLike {
  close: StdioServerTransport['close'];
}

interface EngineLike {
  processThought: (
    input: ThoughtData
  ) => ProcessResult | Promise<ProcessResult>;
  close?: CloseFn;
}

export interface ProcessErrorHandlerDeps {
  processLike?: ProcessLike;
  logError?: (message: string) => void;
  exit?: (code: number) => void;
}

interface ShutdownDependencies {
  processLike?: ProcessLike;
  server: unknown;
  engine: unknown;
  transport: unknown;
  publishLifecycleEvent?: (event: LifecycleEvent) => void;
  now?: () => number;
  shutdownTimeoutMs?: number;
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

  const handlerFor =
    (label: 'unhandledRejection' | 'uncaughtException') => (value: unknown) => {
      const error = value instanceof Error ? value : new Error(String(value));
      logError(`thinkseq: ${label}: ${error.message}`);
      exit(1);
    };

  proc.on('unhandledRejection', handlerFor('unhandledRejection'));
  proc.on('uncaughtException', handlerFor('uncaughtException'));
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
  installStdioInvalidMessageGuards(transport);
  installStdioParseErrorResponder(transport);
  return transport;
}

const DEFAULT_RUN_DEPENDENCIES: ResolvedRunDependencies = {
  processLike: process,
  packageReadTimeoutMs: DEFAULT_PACKAGE_READ_TIMEOUT_MS,
  readPackageJson: readSelfPackageJson,
  publishLifecycleEvent,
  createServer,
  connectServer,
  registerTool: registerThinkSeq,
  engineFactory: () => new WorkerEngineClient(),
  installShutdownHandlers,
  now: Date.now,
};

async function closeSafely(value: unknown): Promise<void> {
  try {
    if (hasClose(value)) {
      await value.close();
    }
  } catch {
    return;
  }
}

async function closeWithTimeout(
  value: unknown,
  timeoutMs: number
): Promise<void> {
  const timeout = new Promise<void>((resolve) => {
    setTimeout(resolve, timeoutMs);
  });
  await Promise.race([closeSafely(value), timeout]);
}

function installShutdownHandlers({
  processLike,
  server,
  engine,
  transport,
  publishLifecycleEvent: publishLifecycle,
  now,
  shutdownTimeoutMs,
}: ShutdownDependencies): void {
  const proc = processLike ?? process;
  const emit = publishLifecycle ?? publishLifecycleEvent;
  const timestamp = now ?? Date.now;
  const timeoutMs = shutdownTimeoutMs ?? DEFAULT_SHUTDOWN_TIMEOUT_MS;
  let shuttingDown = false;

  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;

    emit({
      type: 'lifecycle.shutdown',
      ts: timestamp(),
      signal,
    });

    await closeWithTimeout(server, timeoutMs);
    await closeWithTimeout(engine, timeoutMs);
    await closeWithTimeout(transport, timeoutMs);
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
  const resolved: ResolvedRunDependencies = {
    ...DEFAULT_RUN_DEPENDENCIES,
    ...deps,
  };

  const pkg = await resolved.readPackageJson(
    AbortSignal.timeout(resolved.packageReadTimeoutMs)
  );
  const name = pkg.name ?? 'thinkseq';
  const version = pkg.version ?? '0.0.0';

  resolved.publishLifecycleEvent({
    type: 'lifecycle.started',
    ts: resolved.now(),
  });

  const server = resolved.createServer(name, version);
  const engine = resolved.engineFactory();
  resolved.registerTool(server, engine);
  installInitializationGuards(server);

  const transport = await resolved.connectServer(server);
  resolved.installShutdownHandlers({
    processLike: resolved.processLike,
    server,
    engine,
    transport,
    publishLifecycleEvent: resolved.publishLifecycleEvent,
    now: resolved.now,
  });
}
