import assert from 'node:assert/strict';
import diagnostics_channel from 'node:diagnostics_channel';
import { describe, it } from 'node:test';

import {
  publishEngineEvent,
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

  it('publishEngineEvent does not throw without subscribers', () => {
    assert.doesNotThrow(() => {
      publishEngineEvent({
        type: 'engine.sequence_gap',
        ts: Date.now(),
        expected: 2,
        received: 5,
      });
    });
  });

  it('publishEngineEvent publishes when subscribed', async (t) => {
    const messages: unknown[] = [];
    const handler = (message: unknown): void => {
      messages.push(message);
    };

    diagnostics_channel.subscribe('thinkseq:engine', handler);
    t.after(() => diagnostics_channel.unsubscribe('thinkseq:engine', handler));

    publishEngineEvent({
      type: 'engine.sequence_gap',
      ts: 999,
      expected: 2,
      received: 10,
    });

    await Promise.resolve();

    assert.equal(messages.length, 1);
    const msg = messages[0] as {
      type?: unknown;
      expected?: unknown;
      received?: unknown;
    };
    assert.equal(msg.type, 'engine.sequence_gap');
    assert.equal(msg.expected, 2);
    assert.equal(msg.received, 10);
  });
});
