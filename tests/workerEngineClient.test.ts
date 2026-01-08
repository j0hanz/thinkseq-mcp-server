import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { ProcessResult } from '../src/lib/types.js';
import { WorkerEngineClient } from '../src/lib/workerEngineClient.js';
import type { EngineWorkerResponse } from '../src/lib/workerProtocol.js';

const createInput = (
  thoughtNumber: number
): Parameters<WorkerEngineClient['processThought']>[0] => ({
  thought: `t${String(thoughtNumber)}`,
  thoughtNumber,
  totalThoughts: 3,
  nextThoughtNeeded: thoughtNumber < 3,
});

type WorkerEvent = 'message' | 'messageerror' | 'error' | 'exit';

class FakeWorker {
  private readonly handlers = new Map<
    WorkerEvent,
    ((...args: unknown[]) => void)[]
  >();
  readonly posted: unknown[] = [];
  throwOnPost = false;
  terminated = false;

  on(event: WorkerEvent, listener: (...args: unknown[]) => void): void {
    const existing = this.handlers.get(event) ?? [];
    existing.push(listener);
    this.handlers.set(event, existing);
  }

  emit(event: WorkerEvent, value: unknown): void {
    const listeners = this.handlers.get(event) ?? [];
    listeners.forEach((listener) => {
      listener(value);
    });
  }

  postMessage(message: unknown): void {
    if (this.throwOnPost) {
      throw new Error('post failed');
    }
    this.posted.push(message);
  }

  terminate(): Promise<void> {
    this.terminated = true;
    return Promise.resolve();
  }
}

const createResult = (): ProcessResult => ({
  ok: true,
  result: {
    thoughtNumber: 1,
    totalThoughts: 1,
    progress: 1,
    nextThoughtNeeded: false,
    thoughtHistoryLength: 1,
    branches: [],
    context: { recentThoughts: [], hasRevisions: false },
  },
});

const createOkResponse = (): EngineWorkerResponse => ({
  id: '1',
  ok: true,
  result: createResult(),
});

const createFakeClient = (
  options: ConstructorParameters<typeof WorkerEngineClient>[0] = {}
): { client: WorkerEngineClient; worker: FakeWorker } => {
  let worker: FakeWorker | null = null;
  const client = new WorkerEngineClient({
    timeoutMs: 10,
    ...options,
    workerFactory: () => {
      worker = new FakeWorker();
      return worker;
    },
  });
  assert.ok(worker);
  return { client, worker };
};

void describe('WorkerEngineClient', () => {
  void it('processes thoughts in a single stateful worker', async (t) => {
    const client = new WorkerEngineClient({ timeoutMs: 2000 });
    t.after(async () => {
      await client.close();
    });

    const r1 = await client.processThought(createInput(1));
    assert.equal(r1.ok, true);
    assert.equal(r1.result.thoughtHistoryLength, 1);

    const r2 = await client.processThought(createInput(2));
    assert.equal(r2.ok, true);
    assert.equal(r2.result.thoughtHistoryLength, 2);
  });

  void it('rejects after close', async () => {
    const client = new WorkerEngineClient({ timeoutMs: 2000 });
    await client.close();

    await assert.rejects(
      () => client.processThought(createInput(1)),
      /closed/i
    );
  });
});

void describe('WorkerEngineClient error paths (lifecycle)', () => {
  void it('rejects when closed with inflight requests', async () => {
    const { client, worker } = createFakeClient();
    const pending = client.processThought(createInput(1));

    await client.close();

    assert.equal(worker.terminated, true);
    await assert.rejects(pending, /E_WORKER_CLOSED/);
  });

  void it('rejects when inflight limit is exceeded', async () => {
    const { client } = createFakeClient({ maxInflight: 1 });
    const pending = client.processThought(createInput(1));

    await assert.rejects(
      () => client.processThought(createInput(2)),
      /backpressure/i
    );

    await client.close();
    await assert.rejects(pending, /E_WORKER_CLOSED/);
  });

  void it('rejects on timeout', async () => {
    const { client } = createFakeClient({ timeoutMs: 5 });
    await assert.rejects(
      () => client.processThought(createInput(1)),
      /timed out/i
    );
    await client.close();
  });

  void it('rejects when postMessage throws', async () => {
    const { client, worker } = createFakeClient();
    worker.throwOnPost = true;

    await assert.rejects(
      () => client.processThought(createInput(1)),
      /post failed/i
    );
    await client.close();
  });
});

void describe('WorkerEngineClient entry validation', () => {
  void it('throws when worker entry is missing', () => {
    assert.throws(
      () => new WorkerEngineClient({ entryExists: () => false }),
      /Worker engine entry not found/
    );
  });

  void it('uses dist entry when base url includes /dist/', async () => {
    let seenEntry: URL | null = null;
    const client = new WorkerEngineClient({
      entryBaseUrl: 'file:///dist/index.js',
      workerFactory: (entry) => {
        seenEntry = entry;
        return new FakeWorker();
      },
    });

    assert.ok(seenEntry);
    assert.ok(seenEntry.pathname.endsWith('/workers/engineWorker.js'));
    assert.equal(seenEntry.pathname.includes('/dist/workers/'), false);
    await client.close();
  });
});

void describe('WorkerEngineClient error paths (events)', () => {
  void it('ignores non-response messages', async () => {
    const { client, worker } = createFakeClient();
    const pending = client.processThought(createInput(1));

    worker.emit('message', { unexpected: true });
    worker.emit('message', createOkResponse());

    const result = await pending;
    assert.equal(result.ok, true);
    await client.close();
  });

  void it('rejects on worker message errors', async () => {
    const { client, worker } = createFakeClient();
    const pending = client.processThought(createInput(1));

    worker.emit('messageerror', new Error('bad message'));

    await assert.rejects(pending, /E_WORKER_MESSAGE/);
    await client.close();
  });

  void it('rejects on worker errors', async () => {
    const { client, worker } = createFakeClient();
    const pending = client.processThought(createInput(1));

    worker.emit('error', new Error('boom'));

    await assert.rejects(pending, /E_WORKER_ERROR/);
    await client.close();
  });
});

void describe('WorkerEngineClient error paths (responses)', () => {
  void it('rejects when worker exits', async () => {
    const { client, worker } = createFakeClient();
    const pending = client.processThought(createInput(1));

    worker.emit('exit', 2);

    await assert.rejects(pending, /E_WORKER_EXIT/);
    await client.close();
  });

  void it('rejects when worker exits cleanly', async () => {
    const { client, worker } = createFakeClient();
    const pending = client.processThought(createInput(1));

    worker.emit('exit', 0);

    await assert.rejects(pending, /E_WORKER_EXIT/);
    await client.close();
  });

  void it('rejects on worker error response', async () => {
    const { client, worker } = createFakeClient();
    const pending = client.processThought(createInput(1));

    worker.emit('message', {
      id: '1',
      ok: false,
      error: { code: 'E_FAIL', message: 'nope' },
    });

    await assert.rejects(pending, /E_FAIL/);
    await client.close();
  });
});
