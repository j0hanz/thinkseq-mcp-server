import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { WorkerEngineClient } from '../src/lib/workerEngineClient.js';

const createInput = (
  thoughtNumber: number
): Parameters<WorkerEngineClient['processThought']>[0] => ({
  thought: `t${String(thoughtNumber)}`,
  thoughtNumber,
  totalThoughts: 3,
  nextThoughtNeeded: thoughtNumber < 3,
});

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
