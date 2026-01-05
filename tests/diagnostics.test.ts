import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  publishEngineEvent,
  publishLifecycleEvent,
  publishToolEvent,
} from '../src/lib/diagnostics.js';
import {
  assertSequenceGapMessage,
  captureDiagnostics,
} from './helpers/diagnostics.js';

void describe('publishToolEvent', () => {
  void it('does not throw without subscribers', () => {
    assert.doesNotThrow(() => {
      publishToolEvent({
        type: 'tool.start',
        tool: 'thinkseq',
        ts: Date.now(),
      });
    });
  });

  void it('publishes when subscribed', async (t) => {
    const { messages } = captureDiagnostics(t, 'thinkseq:tool');

    publishToolEvent({ type: 'tool.start', tool: 'thinkseq', ts: 123 });

    // subscriber is sync; await a microtask for safety
    await Promise.resolve();

    assert.equal(messages.length, 1);
    const msg = messages[0] as {
      type?: unknown;
      tool?: unknown;
      ts?: unknown;
    };
    assert.equal(msg.type, 'tool.start');
    assert.equal(msg.tool, 'thinkseq');
    assert.equal(msg.ts, 123);
  });
});

void describe('publishLifecycleEvent', () => {
  void it('does not throw without subscribers', () => {
    assert.doesNotThrow(() => {
      publishLifecycleEvent({ type: 'lifecycle.started', ts: Date.now() });
    });
  });
});

void describe('publishEngineEvent', () => {
  void it('does not throw without subscribers', () => {
    assert.doesNotThrow(() => {
      publishEngineEvent({
        type: 'engine.sequence_gap',
        ts: Date.now(),
        expected: 2,
        received: 5,
      });
    });
  });

  void it('publishes when subscribed', async (t) => {
    const { messages } = captureDiagnostics(t, 'thinkseq:engine');

    publishEngineEvent({
      type: 'engine.sequence_gap',
      ts: 999,
      expected: 2,
      received: 10,
    });

    await Promise.resolve();

    assertSequenceGapMessage(messages, 2, 10);
  });
});
