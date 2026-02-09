import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';

export interface RequestContext {
  requestId: string;
  startedAt: number;
  startedAtEpochMs: number;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithContext<T>(
  callback: () => T,
  context?: Partial<RequestContext>
): T {
  const current = storage.getStore();
  const store: RequestContext = {
    requestId: context?.requestId ?? current?.requestId ?? randomUUID(),
    startedAt: context?.startedAt ?? current?.startedAt ?? performance.now(),
    startedAtEpochMs:
      context?.startedAtEpochMs ?? current?.startedAtEpochMs ?? Date.now(),
  };
  if (!current) return storage.run(store, callback);
  if (
    current.requestId === store.requestId &&
    current.startedAt === store.startedAt &&
    current.startedAtEpochMs === store.startedAtEpochMs
  ) {
    return callback();
  }
  return storage.run(store, callback);
}

export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}
