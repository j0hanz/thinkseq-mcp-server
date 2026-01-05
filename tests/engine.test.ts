import assert from 'node:assert';
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
});
