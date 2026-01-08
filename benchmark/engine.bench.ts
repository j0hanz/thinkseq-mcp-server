import { performance } from 'node:perf_hooks';

import { ThinkingEngine } from '../src/engine.js';

interface BenchResult {
  label: string;
  iterations: number;
  durationMs: number;
  opsPerSecond: number;
}

function runNewThoughtBench(iterations: number): BenchResult {
  const engine = new ThinkingEngine({ maxThoughts: iterations + 1 });
  const start = performance.now();
  for (let i = 0; i < iterations; i += 1) {
    engine.processThought({
      thought: `Thought ${i}`,
      totalThoughts: iterations,
    });
  }
  const durationMs = performance.now() - start;
  return {
    label: 'new-thought',
    iterations,
    durationMs,
    opsPerSecond: iterations / (durationMs / 1000),
  };
}

function runRevisionBench(iterations: number): BenchResult {
  const start = performance.now();
  for (let i = 0; i < iterations; i += 1) {
    const engine = new ThinkingEngine();
    engine.processThought({ thought: 'A', totalThoughts: 3 });
    engine.processThought({ thought: 'B', totalThoughts: 3 });
    engine.processThought({
      thought: 'Revised A',
      totalThoughts: 3,
      revisesThought: 1,
    });
  }
  const durationMs = performance.now() - start;
  return {
    label: 'revision',
    iterations,
    durationMs,
    opsPerSecond: iterations / (durationMs / 1000),
  };
}

function formatResult(result: BenchResult): string {
  return `${result.label}: ${result.iterations} ops in ${result.durationMs.toFixed(
    2
  )}ms (${result.opsPerSecond.toFixed(0)} ops/sec)`;
}

const results = [runNewThoughtBench(10000), runRevisionBench(1000)];

for (const result of results) {
  console.log(formatResult(result));
}
