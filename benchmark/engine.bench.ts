import { execSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';

import { ThinkingEngine } from '../src/engine.js';

interface BenchResult {
  label: string;
  iterations: number;
  durationMs: number;
  opsPerSecond: number;
}

interface BenchSummary {
  label: string;
  iterations: number;
  samples: number;
  opsPerSecond: number[];
  durationMs: number[];
  medianOps: number;
  meanOps: number;
  stdevOps: number;
}

const DEFAULT_NEW_ITERATIONS = 10000;
const DEFAULT_REVISION_ITERATIONS = 1000;
const DEFAULT_WARMUP_ITERATIONS = 1000;
const DEFAULT_SAMPLE_COUNT = 1;

const parsePositiveInt = (
  value: string | undefined,
  fallback: number
): number => {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const tryPinProcess = (maskRaw?: string): void => {
  if (!maskRaw) return;
  const mask = Number.parseInt(maskRaw, 0);
  if (!Number.isFinite(mask) || mask <= 0) return;

  try {
    if (process.platform === 'win32') {
      execSync(
        `powershell -NoProfile -Command "$proc = [System.Diagnostics.Process]::GetProcessById(${process.pid}); $proc.ProcessorAffinity = ${mask}"`,
        { stdio: 'ignore' }
      );
      return;
    }
    if (process.platform === 'linux') {
      execSync(`taskset -p ${mask} ${process.pid}`, { stdio: 'ignore' });
    }
  } catch {
    return;
  }
};

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

function getMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function getMean(values: number[]): number {
  if (values.length === 0) return 0;
  const sum = values.reduce((acc, value) => acc + value, 0);
  return sum / values.length;
}

function getStdev(values: number[], mean: number): number {
  if (values.length <= 1) return 0;
  const variance =
    values.reduce((acc, value) => acc + (value - mean) ** 2, 0) /
    (values.length - 1);
  return Math.sqrt(variance);
}

function runSamples(
  label: string,
  runner: (iterations: number) => BenchResult,
  iterations: number,
  samples: number
): BenchSummary {
  const ops: number[] = [];
  const durations: number[] = [];
  for (let i = 0; i < samples; i += 1) {
    const result = runner(iterations);
    ops.push(result.opsPerSecond);
    durations.push(result.durationMs);
  }
  const meanOps = getMean(ops);
  return {
    label,
    iterations,
    samples,
    opsPerSecond: ops,
    durationMs: durations,
    medianOps: getMedian(ops),
    meanOps,
    stdevOps: getStdev(ops, meanOps),
  };
}

function formatResult(label: string, summary: BenchSummary): string {
  if (summary.samples <= 1) {
    return `${label}: ${summary.iterations} ops in ${summary.durationMs[0].toFixed(
      2
    )}ms (${summary.opsPerSecond[0].toFixed(0)} ops/sec)`;
  }

  return `${label}: ${summary.iterations} ops x${
    summary.samples
  } (${summary.medianOps.toFixed(0)} ops/sec median, mean ${summary.meanOps.toFixed(
    0
  )}, stdev ${summary.stdevOps.toFixed(0)})`;
}

const sampleCount = parsePositiveInt(
  process.env.THINKSEQ_BENCH_SAMPLES,
  DEFAULT_SAMPLE_COUNT
);
const newIterations = parsePositiveInt(
  process.env.THINKSEQ_BENCH_NEW_ITERATIONS,
  DEFAULT_NEW_ITERATIONS
);
const revisionIterations = parsePositiveInt(
  process.env.THINKSEQ_BENCH_REV_ITERATIONS,
  DEFAULT_REVISION_ITERATIONS
);
const warmupIterations = parsePositiveInt(
  process.env.THINKSEQ_BENCH_WARMUP,
  DEFAULT_WARMUP_ITERATIONS
);
const warmupRevisionIterations = Math.max(1, Math.round(warmupIterations / 10));

tryPinProcess(process.env.THINKSEQ_BENCH_PIN);

if (warmupIterations > 0) {
  runNewThoughtBench(warmupIterations);
  runRevisionBench(warmupRevisionIterations);
}

const newSummary = runSamples(
  'new-thought',
  runNewThoughtBench,
  newIterations,
  sampleCount
);
const revisionSummary = runSamples(
  'revision',
  runRevisionBench,
  revisionIterations,
  sampleCount
);

console.log(formatResult(newSummary.label, newSummary));
console.log(formatResult(revisionSummary.label, revisionSummary));
