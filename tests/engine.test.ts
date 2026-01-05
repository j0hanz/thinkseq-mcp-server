import assert from 'node:assert/strict';
import diagnostics_channel from 'node:diagnostics_channel';
import { describe, it } from 'node:test';

import { ThinkingEngine } from '../src/engine.js';

describe('ThinkingEngine', () => {
  it('should process a simple thought', () => {
    const engine = new ThinkingEngine();
    const result = engine.processThought({
      thought: 'Initial thought',
      thoughtNumber: 1,
      totalThoughts: 3,
      nextThoughtNeeded: true,
    });

    assert.ok(result.ok);
    assert.strictEqual(result.result?.thoughtNumber, 1);
    assert.strictEqual(result.result?.context.recentThoughts.length, 1);
  });

  it('should validate sequence order', () => {
    const engine = new ThinkingEngine();
    // First thought
    engine.processThought({
      thought: 'First',
      thoughtNumber: 1,
      totalThoughts: 3,
      nextThoughtNeeded: true,
    });

    // Valid next
    const res = engine.processThought({
      thought: 'Second',
      thoughtNumber: 2,
      totalThoughts: 3,
      nextThoughtNeeded: true,
    });
    assert.ok(res.ok);
  });

  it('should enforce first thought is 1', () => {
    const engine = new ThinkingEngine();
    assert.throws(() => {
      engine.processThought({
        thought: 'Wrong start',
        thoughtNumber: 2,
        totalThoughts: 5,
        nextThoughtNeeded: true,
      });
    }, /First thought must be number 1/);
  });

  it('should emit diagnostics event on sequence gap', async (t) => {
    const messages: unknown[] = [];
    const handler = (message: unknown): void => {
      messages.push(message);
    };

    diagnostics_channel.subscribe('thinkseq:engine', handler);
    t.after(() => diagnostics_channel.unsubscribe('thinkseq:engine', handler));

    const engine = new ThinkingEngine();
    engine.processThought({
      thought: 'First',
      thoughtNumber: 1,
      totalThoughts: 10,
      nextThoughtNeeded: true,
    });

    // Skip to thought 5 (gap should be detected)
    engine.processThought({
      thought: 'Fifth',
      thoughtNumber: 5,
      totalThoughts: 10,
      nextThoughtNeeded: true,
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
    assert.equal(msg.received, 5);
  });

  it('should prune old thoughts when count exceeds max', () => {
    const engine = new ThinkingEngine(5); // Small limit for testing

    // Add 7 thoughts
    for (let i = 1; i <= 7; i++) {
      engine.processThought({
        thought: `Thought ${String(i)}`,
        thoughtNumber: i,
        totalThoughts: 10,
        nextThoughtNeeded: true,
      });
    }

    const result = engine.processThought({
      thought: 'Thought 8',
      thoughtNumber: 8,
      totalThoughts: 10,
      nextThoughtNeeded: false,
    });

    // Should have pruned to 5 thoughts max
    assert.ok(result.result);
    assert.ok(result.result.thoughtHistoryLength <= 5);
  });
});
