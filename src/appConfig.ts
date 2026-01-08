import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { ThinkingEngine } from './engine.js';
import { publishLifecycleEvent } from './lib/diagnostics.js';
import type { LifecycleEvent } from './lib/diagnostics.js';
import type { PackageInfo } from './lib/package.js';
import { readSelfPackageJson } from './lib/package.js';
import {
  installStdioInvalidMessageGuards,
  installStdioParseErrorResponder,
} from './lib/stdioGuards.js';
import { registerThinkSeq } from './tools/thinkseq.js';

const SERVER_INSTRUCTIONS =
  'ThinkSeq is a tool for structured, sequential thinking with branching and revision support.';
const DEFAULT_PACKAGE_READ_TIMEOUT_MS = 2000;
const DEFAULT_SHUTDOWN_TIMEOUT_MS = 5000;

type CloseFn = () => Promise<void> | void;

export type ProcessLike = Pick<typeof process, 'on' | 'exit'>;
export type TransportLike = Parameters<McpServer['connect']>[0];
export type ServerLike = Pick<McpServer, 'connect' | 'registerTool'>;
export type EngineLike = Pick<ThinkingEngine, 'processThought'> & {
  close?: CloseFn;
};

export interface ShutdownDependencies {
  processLike?: ProcessLike;
  server: unknown;
  engine: unknown;
  transport: unknown;
  publishLifecycleEvent?: (event: LifecycleEvent) => void;
  now?: () => number;
  shutdownTimeoutMs?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function hasClose(value: unknown): value is { close: CloseFn } {
  return isRecord(value) && typeof value.close === 'function';
}

async function closeWithTimeout(
  value: unknown,
  timeoutMs: number
): Promise<void> {
  const timeout = new Promise<void>((resolve) =>
    setTimeout(resolve, timeoutMs)
  );
  const attempt = (async () => {
    try {
      if (hasClose(value)) await value.close();
    } catch {
      return;
    }
  })();
  await Promise.race([attempt, timeout]);
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
    emit({
      type: 'lifecycle.shutdown',
      ts: timestamp(),
      signal,
    });
    await closeWithTimeout(deps.server, timeoutMs);
    await closeWithTimeout(deps.engine, timeoutMs);
    await closeWithTimeout(deps.transport, timeoutMs);
    proc.exit(0);
  };
}

function installShutdownHandlers(deps: ShutdownDependencies): void {
  const proc = deps.processLike ?? process;
  const shutdown = buildShutdownRunner(deps, proc);

  proc.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
  proc.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
}

export interface RunDependencies {
  processLike?: ProcessLike;
  packageReadTimeoutMs?: number;
  shutdownTimeoutMs?: number;
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

export interface ResolvedRunDependencies {
  processLike: ProcessLike;
  packageReadTimeoutMs: number;
  shutdownTimeoutMs?: number;
  readPackageJson: (signal?: AbortSignal) => Promise<PackageInfo>;
  publishLifecycleEvent: (event: LifecycleEvent) => void;
  createServer: (name: string, version: string) => ServerLike;
  connectServer: (
    server: ServerLike,
    createTransport?: () => TransportLike
  ) => Promise<TransportLike>;
  registerTool: (server: ServerLike, engine: EngineLike) => void;
  engineFactory: () => EngineLike;
  installShutdownHandlers: (deps: ShutdownDependencies) => void;
  now: () => number;
}

const defaultCreateServer = (name: string, version: string): ServerLike => {
  return new McpServer(
    { name, version },
    {
      instructions: SERVER_INSTRUCTIONS,
      capabilities: { logging: {} },
    }
  );
};

const defaultConnectServer = async (
  server: ServerLike,
  createTransport: () => TransportLike = () => new StdioServerTransport()
): Promise<TransportLike> => {
  const transport = createTransport();
  await server.connect(transport);
  installStdioInvalidMessageGuards(transport);
  installStdioParseErrorResponder(transport);
  return transport;
};

function resolveCoreDependencies(
  deps: RunDependencies
): Pick<
  ResolvedRunDependencies,
  | 'processLike'
  | 'packageReadTimeoutMs'
  | 'readPackageJson'
  | 'publishLifecycleEvent'
  | 'now'
> {
  return {
    processLike: deps.processLike ?? process,
    packageReadTimeoutMs:
      deps.packageReadTimeoutMs ?? DEFAULT_PACKAGE_READ_TIMEOUT_MS,
    readPackageJson: deps.readPackageJson ?? readSelfPackageJson,
    publishLifecycleEvent: deps.publishLifecycleEvent ?? publishLifecycleEvent,
    now: deps.now ?? Date.now,
  };
}

function resolveServerDependencies(
  deps: RunDependencies
): Pick<ResolvedRunDependencies, 'createServer' | 'connectServer'> {
  return {
    createServer: deps.createServer ?? defaultCreateServer,
    connectServer: deps.connectServer ?? defaultConnectServer,
  };
}

function resolveEngineDependencies(
  deps: RunDependencies
): Pick<
  ResolvedRunDependencies,
  'registerTool' | 'engineFactory' | 'installShutdownHandlers'
> {
  return {
    registerTool: deps.registerTool ?? registerThinkSeq,
    engineFactory: deps.engineFactory ?? (() => new ThinkingEngine()),
    installShutdownHandlers:
      deps.installShutdownHandlers ?? installShutdownHandlers,
  };
}

function resolveShutdownTimeout(
  deps: RunDependencies
): Pick<ResolvedRunDependencies, 'shutdownTimeoutMs'> {
  if (deps.shutdownTimeoutMs === undefined) return {};
  return { shutdownTimeoutMs: deps.shutdownTimeoutMs };
}

export function resolveRunDependencies(
  deps: RunDependencies
): ResolvedRunDependencies {
  return {
    ...resolveCoreDependencies(deps),
    ...resolveServerDependencies(deps),
    ...resolveEngineDependencies(deps),
    ...resolveShutdownTimeout(deps),
  };
}

export function resolvePackageIdentity(pkg: PackageInfo): {
  name: string;
  version: string;
} {
  return {
    name: pkg.name ?? 'thinkseq',
    version: pkg.version ?? '0.0.0',
  };
}

export function buildShutdownDependencies(
  resolved: ResolvedRunDependencies,
  payload: { server: unknown; engine: unknown; transport: unknown }
): ShutdownDependencies {
  const base = {
    processLike: resolved.processLike,
    server: payload.server,
    engine: payload.engine,
    transport: payload.transport,
    publishLifecycleEvent: resolved.publishLifecycleEvent,
    now: resolved.now,
  };

  return resolved.shutdownTimeoutMs !== undefined
    ? { ...base, shutdownTimeoutMs: resolved.shutdownTimeoutMs }
    : base;
}
