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
  const store: RequestContext = {
    requestId: context?.requestId ?? randomUUID(),
    startedAt: context?.startedAt ?? performance.now(),
    startedAtEpochMs: context?.startedAtEpochMs ?? Date.now(),
  };
  return storage.run(store, callback);
}

export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}
