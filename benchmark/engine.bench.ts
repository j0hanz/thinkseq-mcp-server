import { performance } from 'node:perf_hooks';

import { ThinkingEngine } from '../src/engine.js';

const ITERATIONS = 10000;
const THOUGHT_TEXT = 'x'.repeat(32);

const engine = new ThinkingEngine({ maxThoughts: ITERATIONS + 1 });
const durations = new Array<number>(ITERATIONS);

const startMemory = process.memoryUsage().heapUsed;
const totalStart = performance.now();

for (let index = 0; index < ITERATIONS; index += 1) {
  const start = performance.now();
  engine.processThought({
    thought: THOUGHT_TEXT,
    thoughtNumber: index + 1,
    totalThoughts: ITERATIONS,
    nextThoughtNeeded: index + 1 < ITERATIONS,
  });
  durations[index] = performance.now() - start;
}

const totalMs = performance.now() - totalStart;
const endMemory = process.memoryUsage().heapUsed;

const sorted = durations.slice().sort((a, b) => a - b);
const p95Index = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
const p95Ms = sorted[p95Index];
const avgMs = totalMs / ITERATIONS;
const maxMs = sorted[sorted.length - 1];
const opsPerSec = (ITERATIONS / totalMs) * 1000;

const report = {
  iterations: ITERATIONS,
  totalMs: Number(totalMs.toFixed(2)),
  avgMs: Number(avgMs.toFixed(4)),
  p95Ms: Number(p95Ms.toFixed(4)),
  maxMs: Number(maxMs.toFixed(4)),
  opsPerSec: Number(opsPerSec.toFixed(2)),
  heapUsedDeltaBytes: endMemory - startMemory,
};

console.log(JSON.stringify(report, null, 2));
