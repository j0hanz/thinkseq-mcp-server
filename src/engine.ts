import { publishEngineEvent } from './lib/diagnostics.js';
import type {
  ContextSummary,
  ProcessResult,
  StoredThought,
  ThoughtData,
} from './lib/types.js';

const DEFAULT_MAX_THOUGHTS = 500;
const MAX_THOUGHTS_CAP = 10000;
const MAX_MEMORY_BYTES = 100 * 1024 * 1024; // 100MB soft cap
const ESTIMATED_THOUGHT_OVERHEAD_BYTES = 200;

export interface ThinkingEngineOptions {
  maxThoughts?: number;
  maxMemoryBytes?: number;
  estimatedThoughtOverheadBytes?: number;
}

function normalizeMaxThoughts(value?: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_MAX_THOUGHTS;
  }
  const clamped = Math.max(1, Math.min(MAX_THOUGHTS_CAP, Math.trunc(value)));
  return clamped;
}

function normalizePositiveInt(
  value: number | undefined,
  fallback: number
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(1, Math.trunc(value));
}

export class ThinkingEngine {
  private thoughts: StoredThought[] = [];
  private branches = new Map<string, StoredThought[]>();
  private readonly maxThoughts: number;
  private readonly maxMemoryBytes: number;
  private readonly estimatedThoughtOverheadBytes: number;

  constructor(maxThoughtsOrOptions?: number | ThinkingEngineOptions) {
    const options =
      typeof maxThoughtsOrOptions === 'number'
        ? { maxThoughts: maxThoughtsOrOptions }
        : (maxThoughtsOrOptions ?? {});
    this.maxThoughts = normalizeMaxThoughts(options.maxThoughts);
    this.maxMemoryBytes = normalizePositiveInt(
      options.maxMemoryBytes,
      MAX_MEMORY_BYTES
    );
    this.estimatedThoughtOverheadBytes = normalizePositiveInt(
      options.estimatedThoughtOverheadBytes,
      ESTIMATED_THOUGHT_OVERHEAD_BYTES
    );
  }

  processThought(input: ThoughtData): ProcessResult {
    this.validateThoughtNumber(input);

    const stored = this.createStoredThought(input);
    this.storeThought(stored);

    this.pruneHistoryIfNeeded();

    return this.buildProcessResult(stored, input);
  }

  private createStoredThought(input: ThoughtData): StoredThought {
    const totalThoughts = Math.max(input.totalThoughts, input.thoughtNumber);
    return {
      ...input,
      totalThoughts,
      timestamp: Date.now(),
      branchPath: this.getBranchPath(input),
    };
  }

  private storeThought(stored: StoredThought): void {
    this.thoughts.push(stored);
    this.trackBranch(stored);
  }

  private trackBranch(stored: StoredThought): void {
    if (!stored.branchId) return;
    const branch = this.branches.get(stored.branchId) ?? [];
    branch.push(stored);
    this.branches.set(stored.branchId, branch);
  }

  private buildProcessResult(
    stored: StoredThought,
    input: ThoughtData
  ): ProcessResult {
    const context = this.buildContextSummary();
    return {
      ok: true,
      result: {
        thoughtNumber: stored.thoughtNumber,
        totalThoughts: stored.totalThoughts,
        nextThoughtNeeded: input.nextThoughtNeeded,
        thoughtHistoryLength: this.thoughts.length,
        branches: Array.from(this.branches.keys()),
        context,
      },
    };
  }

  private buildContextSummary(): ContextSummary {
    const recent = this.thoughts.slice(-5);
    return {
      recentThoughts: recent.map((t) => ({
        number: t.thoughtNumber,
        preview:
          t.thought.slice(0, 100) + (t.thought.length > 100 ? '...' : ''),
        type: t.thoughtType,
      })),
      currentBranch: this.getCurrentBranch(),
      hasRevisions: this.thoughts.some((t) => t.isRevision),
    };
  }

  private validateThoughtNumber(input: ThoughtData): void {
    const lastThought = this.thoughts.at(-1);

    if (!lastThought) {
      this.ensureFirstThought(input.thoughtNumber);
      return;
    }

    if (this.isRevisionOrBranch(input)) {
      return;
    }

    this.warnOnSequenceGap(lastThought, input.thoughtNumber);
  }

  private ensureFirstThought(thoughtNumber: number): void {
    if (thoughtNumber === 1) return;
    throw new Error(
      `First thought must be number 1, got ${String(thoughtNumber)}`
    );
  }

  private isRevisionOrBranch(input: ThoughtData): boolean {
    const isRevision = input.isRevision === true;
    const isBranch = input.branchFromThought !== undefined;
    return isRevision || isBranch;
  }

  private warnOnSequenceGap(
    lastThought: StoredThought,
    thoughtNumber: number
  ): void {
    if (thoughtNumber === lastThought.thoughtNumber + 1) return;
    publishEngineEvent({
      type: 'engine.sequence_gap',
      ts: Date.now(),
      expected: lastThought.thoughtNumber + 1,
      received: thoughtNumber,
    });
  }

  private pruneHistoryIfNeeded(): void {
    // Count-based pruning
    let pruned = false;
    const excess = this.thoughts.length - this.maxThoughts;
    if (excess > 0) {
      this.thoughts.splice(0, excess);
      pruned = true;
    }

    // Memory-aware pruning: estimate current memory usage
    const estimatedBytes = this.thoughts.reduce((sum, t) => {
      return sum + t.thought.length * 2 + this.estimatedThoughtOverheadBytes;
    }, 0);

    if (estimatedBytes > this.maxMemoryBytes && this.thoughts.length > 10) {
      // Prune oldest 20% when over memory threshold
      const toRemove = Math.ceil(this.thoughts.length * 0.2);
      this.thoughts.splice(0, toRemove);
      pruned = true;
    }

    if (pruned) {
      this.rebuildBranches();
    }
  }

  private rebuildBranches(): void {
    this.branches = new Map<string, StoredThought[]>();
    for (const thought of this.thoughts) {
      if (!thought.branchId) continue;
      const branch = this.branches.get(thought.branchId) ?? [];
      branch.push(thought);
      this.branches.set(thought.branchId, branch);
    }
  }

  private getBranchPath(input: ThoughtData): string[] {
    return input.branchId ? [input.branchId] : [];
  }

  private getCurrentBranch(): string | undefined {
    return this.thoughts.at(-1)?.branchId;
  }
}
