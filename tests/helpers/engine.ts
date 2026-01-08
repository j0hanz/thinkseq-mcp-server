import type { ThinkingEngine } from '../../src/engine.js';
import type { ThoughtData } from '../../src/lib/types.js';

export function buildNumberedThoughts(
  count: number,
  totalThoughts: number
): {
  thought: string;
  thoughtNumber: number;
  totalThoughts: number;
  nextThoughtNeeded: boolean;
}[] {
  return Array.from({ length: count }, (_, index) => ({
    thought: `Thought ${String(index + 1)}`,
    thoughtNumber: index + 1,
    totalThoughts,
    nextThoughtNeeded: true,
  }));
}

export function buildRepeatedThoughts(
  count: number,
  options: { total: number; thought: string }
): {
  thought: string;
  thoughtNumber: number;
  totalThoughts: number;
  nextThoughtNeeded: boolean;
}[] {
  return Array.from({ length: count }, (_, index) => ({
    thought: options.thought,
    thoughtNumber: index + 1,
    totalThoughts: options.total,
    nextThoughtNeeded: true,
  }));
}

export function buildCountPruneInputs(): ThoughtData[] {
  const firstSeven = buildNumberedThoughts(7, 10);
  const finalThought: ThoughtData = {
    thought: 'Thought 8',
    thoughtNumber: 8,
    totalThoughts: 10,
    nextThoughtNeeded: false,
  };
  return [...firstSeven, finalThought];
}

export function buildMemoryPruneInputs(): ThoughtData[] {
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

export function processInputs(
  engine: ThinkingEngine,
  inputs: ThoughtData[]
): ReturnType<ThinkingEngine['processThought']> {
  const [first, ...rest] = inputs;
  return rest.reduce(
    (_, input) => engine.processThought(input),
    engine.processThought(first)
  );
}
