import assert from 'node:assert/strict';
import diagnostics_channel from 'node:diagnostics_channel';
import type { TestContext } from 'node:test';

export interface DiagnosticsCapture {
  messages: unknown[];
}

interface SequenceGapMessage {
  type?: unknown;
  expected?: unknown;
  received?: unknown;
}

export function captureDiagnostics(
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

export function assertSequenceGapMessage(
  messages: unknown[],
  expected: number,
  received: number
): void {
  assert.equal(messages.length, 1);
  const msg = messages[0] as SequenceGapMessage;
  assert.equal(msg.type, 'engine.sequence_gap');
  assert.equal(msg.expected, expected);
  assert.equal(msg.received, received);
}
