import { publishEngineEvent } from './lib/diagnostics.js';
import type {
  ContextSummary,
  ProcessResult,
  StoredThought,
  ThoughtData,
} from './lib/types.js';

const DEFAULT_MAX_THOUGHTS = 500;
const MAX_THOUGHTS_CAP = 10000;
const MAX_MEMORY_BYTES = 100 * 1024 * 1024;
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
  #thoughts: StoredThought[] = [];
  #branches = new Map<string, StoredThought[]>();
  #estimatedBytes = 0;
  #revisionCount = 0;
  readonly #maxThoughts: number;
  readonly #maxMemoryBytes: number;
  readonly #estimatedThoughtOverheadBytes: number;

  constructor(maxThoughtsOrOptions?: number | ThinkingEngineOptions) {
    const options =
      typeof maxThoughtsOrOptions === 'number'
        ? { maxThoughts: maxThoughtsOrOptions }
        : (maxThoughtsOrOptions ?? {});
    this.#maxThoughts = normalizeMaxThoughts(options.maxThoughts);
    this.#maxMemoryBytes = normalizePositiveInt(
      options.maxMemoryBytes,
      MAX_MEMORY_BYTES
    );
    this.#estimatedThoughtOverheadBytes = normalizePositiveInt(
      options.estimatedThoughtOverheadBytes,
      ESTIMATED_THOUGHT_OVERHEAD_BYTES
    );
  }

  processThought(input: ThoughtData): ProcessResult {
    this.#validateThoughtNumber(input);

    const totalThoughts = Math.max(input.totalThoughts, input.thoughtNumber);
    const stored: StoredThought = {
      ...input,
      totalThoughts,
      timestamp: Date.now(),
    };
    this.#thoughts.push(stored);
    this.#recordThoughtMetrics(stored);
    this.#recordBranch(stored);

    this.#pruneHistoryIfNeeded();

    return this.#buildProcessResult(stored, input);
  }

  #buildProcessResult(
    stored: StoredThought,
    input: ThoughtData
  ): ProcessResult {
    const context = this.#buildContextSummary();
    return {
      ok: true,
      result: {
        thoughtNumber: stored.thoughtNumber,
        totalThoughts: stored.totalThoughts,
        nextThoughtNeeded: input.nextThoughtNeeded,
        thoughtHistoryLength: this.#thoughts.length,
        branches: Array.from(this.#branches.keys()),
        context,
      },
    };
  }

  #buildContextSummary(): ContextSummary {
    const recent = this.#thoughts.slice(-5);
    const currentBranch = this.#thoughts.at(-1)?.branchId;
    return {
      recentThoughts: recent.map((t) => {
        const base = {
          number: t.thoughtNumber,
          preview:
            t.thought.slice(0, 100) + (t.thought.length > 100 ? '...' : ''),
        };
        return t.thoughtType ? { ...base, type: t.thoughtType } : base;
      }),
      ...(currentBranch !== undefined ? { currentBranch } : {}),
      hasRevisions: this.#revisionCount > 0,
    };
  }

  #validateThoughtNumber(input: ThoughtData): void {
    const lastThought = this.#thoughts.at(-1);

    if (!lastThought) {
      this.#ensureFirstThought(input.thoughtNumber);
      return;
    }

    if (this.#isRevisionOrBranch(input)) {
      return;
    }

    this.#warnOnSequenceGap(lastThought, input.thoughtNumber);
  }

  #ensureFirstThought(thoughtNumber: number): void {
    if (thoughtNumber === 1) return;
    throw new Error(
      `First thought must be number 1, got ${String(thoughtNumber)}`
    );
  }

  #isRevisionOrBranch(input: ThoughtData): boolean {
    const isRevision = input.isRevision === true;
    const isBranch = input.branchFromThought !== undefined;
    return isRevision || isBranch;
  }

  #warnOnSequenceGap(lastThought: StoredThought, thoughtNumber: number): void {
    if (thoughtNumber === lastThought.thoughtNumber + 1) return;
    publishEngineEvent({
      type: 'engine.sequence_gap',
      ts: Date.now(),
      expected: lastThought.thoughtNumber + 1,
      received: thoughtNumber,
    });
  }

  #pruneHistoryIfNeeded(): void {
    const excess = this.#thoughts.length - this.#maxThoughts;
    if (excess > 0) {
      const batch = Math.max(excess, Math.ceil(this.#maxThoughts * 0.1));
      this.#removeOldest(batch);
    }

    if (
      this.#estimatedBytes > this.#maxMemoryBytes &&
      this.#thoughts.length > 10
    ) {
      const toRemove = Math.ceil(this.#thoughts.length * 0.2);
      this.#removeOldest(toRemove);
    }
  }

  #estimateThoughtBytes(thought: StoredThought): number {
    return thought.thought.length * 2 + this.#estimatedThoughtOverheadBytes;
  }

  #recordThoughtMetrics(thought: StoredThought): void {
    this.#estimatedBytes += this.#estimateThoughtBytes(thought);
    if (thought.isRevision) {
      this.#revisionCount += 1;
    }
  }

  #recordBranch(thought: StoredThought): void {
    if (!thought.branchId) return;
    const branch = this.#branches.get(thought.branchId);
    if (branch) {
      branch.push(thought);
      return;
    }
    this.#branches.set(thought.branchId, [thought]);
  }

  #removeOldest(count: number): void {
    if (count <= 0 || this.#thoughts.length === 0) return;
    const actual = Math.min(count, this.#thoughts.length);
    const removed = this.#thoughts.splice(0, actual);
    this.#applyRemoval(removed);
  }

  #applyRemoval(removed: StoredThought[]): void {
    if (removed.length === 0) return;
    const branchRemovals = this.#collectBranchRemovals(removed);
    this.#applyBranchRemovals(branchRemovals);
  }

  #collectBranchRemovals(removed: StoredThought[]): Map<string, number> {
    const branchRemovals = new Map<string, number>();
    for (const thought of removed) {
      this.#applyMetricRemoval(thought);
      this.#recordBranchRemoval(branchRemovals, thought.branchId);
    }
    return branchRemovals;
  }

  #applyMetricRemoval(thought: StoredThought): void {
    this.#estimatedBytes -= this.#estimateThoughtBytes(thought);
    if (thought.isRevision) {
      this.#revisionCount -= 1;
    }
  }

  #recordBranchRemoval(
    branchRemovals: Map<string, number>,
    branchId?: string
  ): void {
    if (!branchId) return;
    const current = branchRemovals.get(branchId) ?? 0;
    branchRemovals.set(branchId, current + 1);
  }

  #applyBranchRemovals(branchRemovals: Map<string, number>): void {
    for (const [branchId, count] of branchRemovals) {
      this.#trimBranch(branchId, count);
    }
  }

  #trimBranch(branchId: string, count: number): void {
    const branch = this.#branches.get(branchId);
    if (!branch) return;
    if (count >= branch.length) {
      this.#branches.delete(branchId);
      return;
    }
    branch.splice(0, count);
  }
}
