import { performance } from 'node:perf_hooks';

import { ThinkingEngine } from '../src/engine.js';

const iterations = Number(process.env.BENCH_ITERATIONS ?? '5000');
const thoughtSize = Number(process.env.BENCH_THOUGHT_SIZE ?? '160');

const engine = new ThinkingEngine(iterations);
const repeatCount = Math.max(1, Math.round(thoughtSize / 13));
const thought = 'bench-thought-'.repeat(repeatCount);
const baseInput = {
  thought,
  totalThoughts: iterations,
  nextThoughtNeeded: true,
};

const durations: number[] = [];
const memStart = process.memoryUsage().rss;

for (let i = 1; i <= iterations; i += 1) {
  const start = performance.now();
  engine.processThought({
    ...baseInput,
    thoughtNumber: i,
    nextThoughtNeeded: i < iterations,
  });
  durations.push(performance.now() - start);
}

durations.sort((a, b) => a - b);

const sum = durations.reduce((acc, value) => acc + value, 0);
const p95Index = Math.floor(durations.length * 0.95);
const avgMs = sum / durations.length;
const p95Ms = durations[p95Index] ?? 0;
const memEnd = process.memoryUsage().rss;

const output = {
  iterations,
  thoughtSize,
  avgMs: Number(avgMs.toFixed(4)),
  p95Ms: Number(p95Ms.toFixed(4)),
  rssMB: Number((memEnd / 1024 / 1024).toFixed(2)),
  deltaMB: Number(((memEnd - memStart) / 1024 / 1024).toFixed(2)),
};

console.log(JSON.stringify(output));
