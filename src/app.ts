import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type {
  JSONRPCMessage,
  MessageExtraInfo,
} from '@modelcontextprotocol/sdk/types.js';

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
  connect: (transport: TransportLike) => Promise<void> | void;
  registerTool: McpServer['registerTool'];
}

interface TransportLike {
  start: () => Promise<void>;
  send: (message: JSONRPCMessage) => Promise<void>;
  close: () => Promise<void>;
  onmessage?: (message: JSONRPCMessage, extra?: MessageExtraInfo) => void;
  onerror?: (error: Error) => void;
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
  connectServer?: (
    server: ServerLike,
    createTransport?: () => TransportLike
  ) => Promise<TransportLike>;
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

export function createServer(name: string, version: string): ServerLike {
  return new McpServer(
    { name, version },
    {
      instructions: SERVER_INSTRUCTIONS,
      capabilities: { logging: {} },
    }
  );
}

export async function connectServer(
  server: ServerLike,
  createTransport: () => TransportLike = () => new StdioServerTransport()
): Promise<TransportLike> {
  const transport = createTransport();
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

function emitShutdown(
  emit: (event: LifecycleEvent) => void,
  timestamp: () => number,
  signal: string
): void {
  emit({
    type: 'lifecycle.shutdown',
    ts: timestamp(),
    signal,
  });
}

function resolveProcess(processLike?: ProcessLike): ProcessLike {
  return processLike ?? process;
}

function buildShutdownRunner(
  deps: ShutdownDependencies,
  proc: ProcessLike
): (signal: string) => Promise<void> {
  const emit = deps.publishLifecycleEvent ?? publishLifecycleEvent;
  const timestamp = deps.now ?? Date.now;
  const timeoutMs = deps.shutdownTimeoutMs ?? DEFAULT_SHUTDOWN_TIMEOUT_MS;
  let shuttingDown = false;
  return async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    emitShutdown(emit, timestamp, signal);
    await closeWithTimeout(deps.server, timeoutMs);
    await closeWithTimeout(deps.engine, timeoutMs);
    await closeWithTimeout(deps.transport, timeoutMs);
    proc.exit(0);
  };
}

export function installShutdownHandlers(deps: ShutdownDependencies): void {
  const proc = resolveProcess(deps.processLike);
  const shutdown = buildShutdownRunner(deps, proc);

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
