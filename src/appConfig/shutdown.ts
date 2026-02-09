import { runWithContext } from '../lib/context.js';
import { publishLifecycleEvent } from '../lib/diagnostics.js';
import type { LifecycleEvent } from '../lib/diagnostics.js';
import type { ResolvedRunDependencies } from './runDependencies.js';
import type { CloseFn, ProcessLike } from './types.js';

const DEFAULT_SHUTDOWN_TIMEOUT_MS = 5000;

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

async function closeSafely(value: unknown): Promise<void> {
  try {
    if (hasClose(value)) await value.close();
  } catch {
    return;
  }
}

async function closeAllWithinTimeout(
  values: readonly unknown[],
  timeoutMs: number
): Promise<void> {
  const timeout = new Promise<void>((resolve) =>
    setTimeout(resolve, timeoutMs)
  );
  const attempt = Promise.allSettled(values.map((value) => closeSafely(value)))
    .then(() => {
      return;
    })
    .catch(() => {
      return;
    });
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
    runWithContext(
      () => {
        emit({
          type: 'lifecycle.shutdown',
          ts: timestamp(),
          signal,
        });
      },
      { requestId: `lifecycle.shutdown:${signal}` }
    );
    await closeAllWithinTimeout(
      [deps.server, deps.engine, deps.transport],
      timeoutMs
    );
    proc.exit(0);
  };
}

export function installShutdownHandlers(deps: ShutdownDependencies): void {
  const proc = deps.processLike ?? process;
  const shutdown = buildShutdownRunner(deps, proc);

  proc.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
  proc.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
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
