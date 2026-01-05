import assert from 'node:assert/strict';
import diagnostics_channel from 'node:diagnostics_channel';
import { describe, it } from 'node:test';

import {
  publishLifecycleEvent,
  publishToolEvent,
} from '../src/lib/diagnostics.js';

describe('diagnostics', () => {
  it('publishToolEvent does not throw without subscribers', () => {
    assert.doesNotThrow(() => {
      publishToolEvent({
        type: 'tool.start',
        tool: 'thinkseq',
        ts: Date.now(),
      });
    });
  });

  it('publishToolEvent publishes when subscribed', async (t) => {
    const messages: unknown[] = [];
    const handler = (message: unknown): void => {
      messages.push(message);
    };

    diagnostics_channel.subscribe('thinkseq:tool', handler);
    t.after(() => diagnostics_channel.unsubscribe('thinkseq:tool', handler));

    publishToolEvent({ type: 'tool.start', tool: 'thinkseq', ts: 123 });

    // subscriber is sync; await a microtask for safety
    await Promise.resolve();

    assert.equal(messages.length, 1);
    const msg = messages[0] as { type?: unknown; tool?: unknown; ts?: unknown };
    assert.equal(msg.type, 'tool.start');
    assert.equal(msg.tool, 'thinkseq');
    assert.equal(msg.ts, 123);
  });

  it('publishLifecycleEvent does not throw without subscribers', () => {
    assert.doesNotThrow(() => {
      publishLifecycleEvent({ type: 'lifecycle.started', ts: Date.now() });
    });
  });
});
