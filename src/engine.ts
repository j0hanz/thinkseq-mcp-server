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

function normalizeInt(
  value: number | undefined,
  fallback: number,
  options: { min: number; max: number }
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(options.min, Math.min(options.max, Math.trunc(value)));
}

export class ThinkingEngine {
  #thoughts: StoredThought[] = [];
  #branches = new Map<string, StoredThought[]>();
  #branchIdsCache: string[] = [];
  #branchIdsDirty = true;
  #estimatedBytes = 0;
  #revisionCount = 0;
  readonly #maxThoughts: number;
  readonly #maxMemoryBytes: number;
  readonly #estimatedThoughtOverheadBytes: number;

  constructor(options: ThinkingEngineOptions = {}) {
    this.#maxThoughts = normalizeInt(
      options.maxThoughts,
      DEFAULT_MAX_THOUGHTS,
      { min: 1, max: MAX_THOUGHTS_CAP }
    );
    this.#maxMemoryBytes = normalizeInt(
      options.maxMemoryBytes,
      MAX_MEMORY_BYTES,
      { min: 1, max: Number.MAX_SAFE_INTEGER }
    );
    this.#estimatedThoughtOverheadBytes = normalizeInt(
      options.estimatedThoughtOverheadBytes,
      ESTIMATED_THOUGHT_OVERHEAD_BYTES,
      { min: 1, max: Number.MAX_SAFE_INTEGER }
    );
  }

  processThought(input: ThoughtData): ProcessResult {
    this.#validateThoughtNumber(input);
    this.#validateReferences(input);
    const stored = this.#createStoredThought(input);
    this.#storeThought(stored);
    this.#pruneHistoryIfNeeded();
    return this.#buildProcessResult(stored);
  }

  #createStoredThought(input: ThoughtData): StoredThought {
    const totalThoughts = Math.max(input.totalThoughts, input.thoughtNumber);
    return {
      ...input,
      totalThoughts,
      timestamp: Date.now(),
    };
  }

  #storeThought(stored: StoredThought): void {
    this.#thoughts.push(stored);
    this.#estimatedBytes += this.#estimateThoughtBytes(stored);
    if (stored.isRevision) this.#revisionCount += 1;
    this.#storeBranchThought(stored);
  }

  #storeBranchThought(stored: StoredThought): void {
    if (!stored.branchId) return;
    const branch = this.#branches.get(stored.branchId);
    if (branch) {
      branch.push(stored);
      return;
    }
    this.#branches.set(stored.branchId, [stored]);
    this.#branchIdsDirty = true;
  }

  #buildProcessResult(stored: StoredThought): ProcessResult {
    const context = this.#buildContextSummary();
    return {
      ok: true,
      result: {
        thoughtNumber: stored.thoughtNumber,
        totalThoughts: stored.totalThoughts,
        progress: Math.min(1, stored.thoughtNumber / stored.totalThoughts),
        nextThoughtNeeded: stored.nextThoughtNeeded,
        thoughtHistoryLength: this.#thoughts.length,
        branches: this.#getBranchIds(),
        context,
      },
    };
  }

  #getBranchIds(): string[] {
    if (this.#branchIdsDirty) {
      this.#branchIdsCache = Array.from(this.#branches.keys());
      this.#branchIdsDirty = false;
    }
    return this.#branchIdsCache;
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
    if (this.#isRevisionOrBranch(input)) return;
    this.#warnOnSequenceGap(lastThought, input.thoughtNumber);
  }

  #ensureFirstThought(thoughtNumber: number): void {
    if (thoughtNumber === 1) return;
    throw new Error(
      `First thought must be number 1, got ${String(thoughtNumber)}`
    );
  }

  #isRevisionOrBranch(input: ThoughtData): boolean {
    return input.isRevision === true || input.branchFromThought !== undefined;
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

  #validateReferences(input: ThoughtData): void {
    const maxThoughtNumber = this.#thoughts.at(-1)?.thoughtNumber ?? 0;
    this.#assertValidReference(
      'revisesThought',
      input.revisesThought,
      maxThoughtNumber
    );
    this.#assertValidReference(
      'branchFromThought',
      input.branchFromThought,
      maxThoughtNumber
    );
  }

  #assertValidReference(
    field: string,
    value: number | undefined,
    max: number
  ): void {
    if (value === undefined || value <= max) return;
    throw new Error(
      `${field} ${String(value)} references non-existent thought (max: ${String(max)})`
    );
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

  #removeOldest(count: number): void {
    if (count <= 0 || this.#thoughts.length === 0) return;
    const actual = Math.min(count, this.#thoughts.length);
    const removed = this.#thoughts.splice(0, actual);
    if (removed.length === 0) return;
    this.#applyRemoval(removed);
  }

  #applyRemoval(removed: StoredThought[]): void {
    const branchRemovals = this.#collectBranchRemovals(removed);
    for (const [branchId, removeCount] of branchRemovals) {
      this.#trimBranch(branchId, removeCount);
    }
  }

  #collectBranchRemovals(removed: StoredThought[]): Map<string, number> {
    const branchRemovals = new Map<string, number>();
    for (const thought of removed) {
      this.#estimatedBytes -= this.#estimateThoughtBytes(thought);
      if (thought.isRevision) this.#revisionCount -= 1;
      if (!thought.branchId) continue;
      branchRemovals.set(
        thought.branchId,
        (branchRemovals.get(thought.branchId) ?? 0) + 1
      );
    }
    return branchRemovals;
  }

  #trimBranch(branchId: string, removeCount: number): void {
    const branch = this.#branches.get(branchId);
    if (!branch) return;
    if (removeCount >= branch.length) {
      this.#branches.delete(branchId);
      this.#branchIdsDirty = true;
      return;
    }
    branch.splice(0, removeCount);
  }
}
