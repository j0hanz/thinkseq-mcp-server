import assert from 'node:assert/strict';
import diagnostics_channel from 'node:diagnostics_channel';
import { describe, it } from 'node:test';
import type { TestContext } from 'node:test';

import {
  publishEngineEvent,
  publishLifecycleEvent,
  publishToolEvent,
} from '../src/lib/diagnostics.js';

void describe('publishToolEvent.basic', () => {
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

    const msg = getSingleMessage(messages);
    assert.equal(msg.type, 'tool.start');
    assert.equal(msg.tool, 'thinkseq');
    assert.equal(msg.ts, 123);
  });
});

void describe('publishToolEvent.errors', () => {
  void it('swallows publish errors', (t) => {
    withPublishFailure(t, 'thinkseq:tool', () => {
      publishToolEvent({
        type: 'tool.start',
        tool: 'thinkseq',
        ts: Date.now(),
      });
    });
    assert.doesNotThrow(() => {
      publishToolEvent({
        type: 'tool.start',
        tool: 'thinkseq',
        ts: Date.now(),
      });
    });
  });
});

void describe('publishLifecycleEvent.basic', () => {
  void it('does not throw without subscribers', () => {
    assert.doesNotThrow(() => {
      publishLifecycleEvent({ type: 'lifecycle.started', ts: Date.now() });
    });
  });

  void it('publishes when subscribed', async (t) => {
    const { messages } = captureDiagnostics(t, 'thinkseq:lifecycle');

    publishLifecycleEvent({ type: 'lifecycle.started', ts: 321 });

    await Promise.resolve();

    const msg = getSingleMessage(messages);
    assert.equal(msg.type, 'lifecycle.started');
    assert.equal(msg.ts, 321);
  });
});

void describe('publishLifecycleEvent.errors', () => {
  void it('swallows publish errors', (t) => {
    withPublishFailure(t, 'thinkseq:lifecycle', () => {
      publishLifecycleEvent({ type: 'lifecycle.started', ts: Date.now() });
    });
    assert.doesNotThrow(() => {
      publishLifecycleEvent({ type: 'lifecycle.started', ts: Date.now() });
    });
  });
});

void describe('publishEngineEvent.basic', () => {
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

void describe('publishEngineEvent.errors', () => {
  void it('swallows publish errors', (t) => {
    withPublishFailure(t, 'thinkseq:engine', () => {
      publishEngineEvent({
        type: 'engine.sequence_gap',
        ts: Date.now(),
        expected: 2,
        received: 5,
      });
    });
    assert.doesNotThrow(() => {
      publishEngineEvent({
        type: 'engine.sequence_gap',
        ts: Date.now(),
        expected: 2,
        received: 5,
      });
    });
  });
});

const withPublishFailure = (
  t: TestContext,
  channelName: string,
  action: () => void
): void => {
  const channel = diagnostics_channel.channel(channelName);
  const noop = (): void => {
    void 0;
  };
  diagnostics_channel.subscribe(channelName, noop);
  t.after(() => diagnostics_channel.unsubscribe(channelName, noop));
  const original = channel.publish.bind(channel);
  channel.publish = (): void => {
    throw new Error('boom');
  };
  t.after(() => {
    channel.publish = original;
  });
  action();
};

interface DiagnosticsCapture {
  messages: unknown[];
}

function captureDiagnostics(
  t: TestContext,
  channel: string
): DiagnosticsCapture {
  const messages: unknown[] = [];
  const handler = (message: unknown): void => {
    messages.push(message);
  };

  diagnostics_channel.subscribe(channel, handler);
  t.after(() => diagnostics_channel.unsubscribe(channel, handler));

  return { messages };
}

function assertSequenceGapMessage(
  messages: unknown[],
  expected: number,
  received: number
): void {
  const msg = getSingleMessage(messages);
  assert.equal(msg.type, 'engine.sequence_gap');
  assert.equal(msg.expected, expected);
  assert.equal(msg.received, received);
}

function getSingleMessage(messages: unknown[]): Record<string, unknown> {
  assert.equal(messages.length, 1);
  const msg = messages[0];
  assert.ok(isRecord(msg));
  return msg;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
