import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ThinkingEngine } from '../src/engine.js';
import type { ThoughtData } from '../src/lib/types.js';

void describe('ThinkingEngine.basic', () => {
  void it('should process a simple thought', () => {
    const engine = new ThinkingEngine();
    const result = engine.processThought({
      thought: 'Initial thought',
      totalThoughts: 3,
    });

    assert.ok(result.ok);
    assert.ok(result.result);
    assert.strictEqual(result.result.thoughtNumber, 1);
    assert.strictEqual(result.result.context.recentThoughts.length, 1);
  });
});

void describe('ThinkingEngine.progress', () => {
  void it('should calculate progress correctly', () => {
    const engine = new ThinkingEngine();

    const result1 = engine.processThought({
      thought: 'Step 1',
      totalThoughts: 4,
    });
    assert.ok(result1.ok);
    assert.strictEqual(result1.result.thoughtNumber, 1);
    assert.strictEqual(result1.result.progress, 0.25);

    const result2 = engine.processThought({
      thought: 'Step 2',
      totalThoughts: 4,
    });
    assert.ok(result2.ok);
    assert.strictEqual(result2.result.thoughtNumber, 2);
    assert.strictEqual(result2.result.progress, 0.5);

    const result3 = engine.processThought({
      thought: 'Step 3',
      totalThoughts: 4,
    });
    assert.ok(result3.ok);
    assert.strictEqual(result3.result.thoughtNumber, 3);
    assert.strictEqual(result3.result.progress, 0.75);

    const result4 = engine.processThought({
      thought: 'Final step',
      totalThoughts: 4,
    });
    assert.ok(result4.ok);
    assert.strictEqual(result4.result.thoughtNumber, 4);
    assert.strictEqual(result4.result.progress, 1);
  });
});

void describe('ThinkingEngine.isComplete', () => {
  void it('should return isComplete: false until target reached', () => {
    const engine = new ThinkingEngine();

    const r1 = engine.processThought({ thought: 'A', totalThoughts: 3 });
    const r2 = engine.processThought({ thought: 'B', totalThoughts: 3 });

    assert.ok(r1.ok && r2.ok);
    assert.strictEqual(r1.result.isComplete, false);
    assert.strictEqual(r2.result.isComplete, false);
  });

  void it('should return isComplete: true when target reached', () => {
    const engine = new ThinkingEngine();

    engine.processThought({ thought: 'A', totalThoughts: 2 });
    const r2 = engine.processThought({ thought: 'B', totalThoughts: 2 });

    assert.ok(r2.ok);
    assert.strictEqual(r2.result.isComplete, true);
  });

  void it('should return isComplete: true when exceeding target', () => {
    const engine = new ThinkingEngine();

    engine.processThought({ thought: 'A', totalThoughts: 2 });
    engine.processThought({ thought: 'B', totalThoughts: 2 });
    const r3 = engine.processThought({ thought: 'C', totalThoughts: 2 });

    assert.ok(r3.ok);
    assert.strictEqual(r3.result.isComplete, true);
  });
});

void describe('ThinkingEngine.autoNumber', () => {
  void it('should auto-increment thoughtNumber', () => {
    const engine = new ThinkingEngine();

    const r1 = engine.processThought({ thought: 'A', totalThoughts: 5 });
    const r2 = engine.processThought({ thought: 'B', totalThoughts: 5 });
    const r3 = engine.processThought({ thought: 'C', totalThoughts: 5 });

    assert.ok(r1.ok && r2.ok && r3.ok);
    assert.strictEqual(r1.result.thoughtNumber, 1);
    assert.strictEqual(r2.result.thoughtNumber, 2);
    assert.strictEqual(r3.result.thoughtNumber, 3);
  });

  void it('should adjust totalThoughts upward if exceeded', () => {
    const engine = new ThinkingEngine();

    engine.processThought({ thought: 'A', totalThoughts: 2 });
    engine.processThought({ thought: 'B', totalThoughts: 2 });
    const r3 = engine.processThought({ thought: 'C', totalThoughts: 2 });

    assert.ok(r3.ok);
    assert.strictEqual(r3.result.thoughtNumber, 3);
    assert.strictEqual(r3.result.totalThoughts, 3);
    assert.strictEqual(r3.result.progress, 1);
  });
});

void describe('ThinkingEngine.pruning', () => {
  void it('should prune old thoughts when count exceeds max', () => {
    const engine = new ThinkingEngine({ maxThoughts: 5 }); // Small limit for testing
    const result = processInputs(engine, buildCountPruneInputs(8));

    // Should have pruned to 5 thoughts max
    assert.ok(result.result);
    assert.ok(result.result.thoughtHistoryLength <= 5);
  });

  void it('should prune when memory cap exceeded', () => {
    const engine = new ThinkingEngine({
      maxThoughts: 1000,
      maxMemoryBytes: 50,
      estimatedThoughtOverheadBytes: 1,
    });
    const result = processInputs(engine, buildMemoryPruneInputs(12));

    assert.ok(result.result);
    assert.ok(result.result.thoughtHistoryLength < 12);
  });
});

void describe('ThinkingEngine.revision', () => {
  void it('should revise a previous thought', () => {
    const engine = new ThinkingEngine();

    engine.processThought({
      thought: 'Step 1: Use recursion',
      totalThoughts: 3,
    });
    engine.processThought({ thought: 'Step 2: Base case', totalThoughts: 3 });

    const r3 = engine.processThought({
      thought: 'Better: Use iteration',
      totalThoughts: 3,
      revisesThought: 1,
    });

    assert.ok(r3.ok);
    assert.strictEqual(r3.result.thoughtNumber, 3);
    assert.strictEqual(r3.result.hasRevisions, true);
    assert.ok(r3.result.context.revisionInfo);
    assert.strictEqual(r3.result.context.revisionInfo.revises, 1);
    assert.deepStrictEqual(r3.result.context.revisionInfo.supersedes, [1, 2]);
  });

  void it('should track active path length after revision', () => {
    const engine = new ThinkingEngine();

    engine.processThought({ thought: 'A', totalThoughts: 4 });
    engine.processThought({ thought: 'B', totalThoughts: 4 });
    engine.processThought({ thought: 'C', totalThoughts: 4 });

    const r4 = engine.processThought({
      thought: 'Revised A',
      totalThoughts: 4,
      revisesThought: 1,
    });

    assert.ok(r4.ok);
    // Thoughts 1, 2, 3 superseded, only thought 4 is active
    assert.strictEqual(r4.result.activePathLength, 1);
    assert.deepStrictEqual(r4.result.revisableThoughts, [4]);
  });

  void it('should return error for non-existent thought revision', () => {
    const engine = new ThinkingEngine();

    engine.processThought({ thought: 'A', totalThoughts: 3 });

    const result = engine.processThought({
      thought: 'Revised',
      totalThoughts: 3,
      revisesThought: 99,
    });

    assert.ok(!result.ok);
    assert.strictEqual(result.error.code, 'E_REVISION_TARGET_NOT_FOUND');
  });

  void it('should return error when revising already-superseded thought', () => {
    const engine = new ThinkingEngine();

    engine.processThought({ thought: 'A', totalThoughts: 3 });
    engine.processThought({ thought: 'B', totalThoughts: 3 });

    // Revise thought 1, which supersedes thoughts 1 and 2
    engine.processThought({
      thought: 'New A',
      totalThoughts: 3,
      revisesThought: 1,
    });

    // Try to revise thought 2, which was already superseded
    const result = engine.processThought({
      thought: 'New B',
      totalThoughts: 3,
      revisesThought: 2,
    });

    assert.ok(!result.ok);
    assert.strictEqual(result.error.code, 'E_REVISION_TARGET_SUPERSEDED');
  });

  void it('should show revisable thoughts in output', () => {
    const engine = new ThinkingEngine();

    const r1 = engine.processThought({ thought: 'A', totalThoughts: 3 });
    const r2 = engine.processThought({ thought: 'B', totalThoughts: 3 });

    assert.ok(r1.ok && r2.ok);
    assert.deepStrictEqual(r1.result.revisableThoughts, [1]);
    assert.deepStrictEqual(r2.result.revisableThoughts, [1, 2]);
  });

  void it('should show hasRevisions: false before any revision', () => {
    const engine = new ThinkingEngine();

    const r1 = engine.processThought({ thought: 'A', totalThoughts: 3 });
    const r2 = engine.processThought({ thought: 'B', totalThoughts: 3 });

    assert.ok(r1.ok && r2.ok);
    assert.strictEqual(r1.result.hasRevisions, false);
    assert.strictEqual(r2.result.hasRevisions, false);
  });
});

function buildCountPruneInputs(count: number): ThoughtData[] {
  return Array.from({ length: count }, () => ({
    thought: 'Thought',
    totalThoughts: count,
  }));
}

function buildMemoryPruneInputs(count: number): ThoughtData[] {
  return Array.from({ length: count }, () => ({
    thought: 'x'.repeat(10),
    totalThoughts: count,
  }));
}

function processInputs(
  engine: ThinkingEngine,
  inputs: ThoughtData[]
): ReturnType<ThinkingEngine['processThought']> {
  const [first, ...rest] = inputs;
  return rest.reduce(
    (_, input) => engine.processThought(input),
    engine.processThought(first)
  );
}
