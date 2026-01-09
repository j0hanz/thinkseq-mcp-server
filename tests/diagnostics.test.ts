import assert from 'node:assert/strict';
import diagnostics_channel from 'node:diagnostics_channel';
import { describe, it } from 'node:test';
import type { TestContext } from 'node:test';

import {
  publishLifecycleEvent,
  publishToolEvent,
} from '../src/lib/diagnostics.js';
import { captureDiagnostics, getSingleMessage } from './helpers/diagnostics.js';

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
