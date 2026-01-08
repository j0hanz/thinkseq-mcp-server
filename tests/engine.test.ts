import assert from 'node:assert/strict';
import diagnostics_channel from 'node:diagnostics_channel';
import { describe, it } from 'node:test';
import type { TestContext } from 'node:test';

import { ThinkingEngine } from '../src/engine.js';
import type { ThoughtData } from '../src/lib/types.js';

void describe('ThinkingEngine.basic', () => {
  void it('should process a simple thought', () => {
    const engine = new ThinkingEngine();
    const result = engine.processThought({
      thought: 'Initial thought',
      thoughtNumber: 1,
      totalThoughts: 3,
      nextThoughtNeeded: true,
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
      thoughtNumber: 1,
      totalThoughts: 4,
      nextThoughtNeeded: true,
    });
    assert.ok(result1.ok);
    assert.strictEqual(result1.result.progress, 0.25);

    const result2 = engine.processThought({
      thought: 'Step 2',
      thoughtNumber: 2,
      totalThoughts: 4,
      nextThoughtNeeded: true,
    });
    assert.ok(result2.ok);
    assert.strictEqual(result2.result.progress, 0.5);

    const result4 = engine.processThought({
      thought: 'Step 3',
      thoughtNumber: 3,
      totalThoughts: 4,
      nextThoughtNeeded: true,
    });
    assert.ok(result4.ok);
    assert.strictEqual(result4.result.progress, 0.75);

    const resultFinal = engine.processThought({
      thought: 'Final step',
      thoughtNumber: 4,
      totalThoughts: 4,
      nextThoughtNeeded: false,
    });
    assert.ok(resultFinal.ok);
    assert.strictEqual(resultFinal.result.progress, 1);
  });
});

void describe('ThinkingEngine.sequence', () => {
  void it('should validate sequence order', () => {
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

  void it('should enforce first thought is 1', () => {
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

void describe('ThinkingEngine.references.revisesThought', () => {
  void it('should reject revisesThought referencing non-existent thought', () => {
    const engine = new ThinkingEngine();
    engine.processThought({
      thought: 'First',
      thoughtNumber: 1,
      totalThoughts: 3,
      nextThoughtNeeded: true,
    });

    assert.throws(() => {
      engine.processThought({
        thought: 'Invalid revision',
        thoughtNumber: 2,
        totalThoughts: 3,
        nextThoughtNeeded: true,
        isRevision: true,
        revisesThought: 99,
      });
    }, /revisesThought 99 references non-existent thought/);
  });

  void it('should allow valid revisesThought reference', () => {
    const engine = new ThinkingEngine();
    engine.processThought({
      thought: 'First',
      thoughtNumber: 1,
      totalThoughts: 3,
      nextThoughtNeeded: true,
    });

    const result = engine.processThought({
      thought: 'Valid revision of thought 1',
      thoughtNumber: 2,
      totalThoughts: 3,
      nextThoughtNeeded: true,
      isRevision: true,
      revisesThought: 1,
    });
    assert.ok(result.ok);
  });
});

void describe('ThinkingEngine.references.branchFromThought', () => {
  void it('should reject branchFromThought referencing non-existent thought', () => {
    const engine = new ThinkingEngine();
    engine.processThought({
      thought: 'First',
      thoughtNumber: 1,
      totalThoughts: 3,
      nextThoughtNeeded: true,
    });

    assert.throws(() => {
      engine.processThought({
        thought: 'Invalid branch',
        thoughtNumber: 2,
        totalThoughts: 3,
        nextThoughtNeeded: true,
        branchFromThought: 50,
        branchId: 'invalid-branch',
      });
    }, /branchFromThought 50 references non-existent thought/);
  });
});

void describe('ThinkingEngine.sequence diagnostics', () => {
  void it('should emit diagnostics event on sequence gap', async (t) => {
    const { messages } = captureDiagnostics(t, 'thinkseq:engine');

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

    assertSequenceGapMessage(messages, 2, 5);
  });
});

void describe('ThinkingEngine.context', () => {
  void it('should track branches and revisions in context', () => {
    const engine = new ThinkingEngine();

    engine.processThought({
      thought: 'First',
      thoughtNumber: 1,
      totalThoughts: 2,
      nextThoughtNeeded: true,
      branchId: 'branch-a',
      thoughtType: 'analysis',
    });

    const result = engine.processThought({
      thought: 'Revision',
      thoughtNumber: 2,
      totalThoughts: 2,
      nextThoughtNeeded: false,
      isRevision: true,
      revisesThought: 1,
      branchFromThought: 1,
      branchId: 'branch-a',
      thoughtType: 'revision',
    });

    assert.ok(result.ok);
    assert.ok(result.result.branches.includes('branch-a'));
    assert.equal(result.result.context.currentBranch, 'branch-a');
    assert.equal(result.result.context.hasRevisions, true);
    assert.equal(result.result.context.recentThoughts[0].type, 'analysis');
  });
});

void describe('ThinkingEngine.pruning', () => {
  void it('should prune old thoughts when count exceeds max', () => {
    const engine = new ThinkingEngine({ maxThoughts: 5 }); // Small limit for testing
    const result = processInputs(engine, buildCountPruneInputs());

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
    const result = processInputs(engine, buildMemoryPruneInputs());

    assert.ok(result.result);
    assert.ok(result.result.thoughtHistoryLength < 12);
    assert.ok(result.result.branches.includes('branch-a'));
  });
});

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

function buildNumberedThoughts(
  count: number,
  totalThoughts: number
): ThoughtData[] {
  return Array.from({ length: count }, (_, index) => ({
    thought: `Thought ${String(index + 1)}`,
    thoughtNumber: index + 1,
    totalThoughts,
    nextThoughtNeeded: true,
  }));
}

function buildRepeatedThoughts(
  count: number,
  options: { total: number; thought: string }
): ThoughtData[] {
  return Array.from({ length: count }, (_, index) => ({
    thought: options.thought,
    thoughtNumber: index + 1,
    totalThoughts: options.total,
    nextThoughtNeeded: true,
  }));
}

function buildCountPruneInputs(): ThoughtData[] {
  const firstSeven = buildNumberedThoughts(7, 10);
  const finalThought: ThoughtData = {
    thought: 'Thought 8',
    thoughtNumber: 8,
    totalThoughts: 10,
    nextThoughtNeeded: false,
  };
  return [...firstSeven, finalThought];
}

function buildMemoryPruneInputs(): ThoughtData[] {
  const baseThoughts = buildRepeatedThoughts(11, {
    total: 12,
    thought: 'x'.repeat(10),
  });
  const lastThought: ThoughtData = {
    thought: 'x'.repeat(10),
    thoughtNumber: 12,
    totalThoughts: 12,
    nextThoughtNeeded: false,
    branchId: 'branch-a',
  };
  return [...baseThoughts, lastThought];
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
