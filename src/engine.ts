import { collectRemovalStats } from './engine/pruning.js';
import {
  COMPACT_RATIO,
  COMPACT_THRESHOLD,
  DEFAULT_MAX_THOUGHTS,
  ESTIMATED_THOUGHT_OVERHEAD_BYTES,
  MAX_MEMORY_BYTES,
  MAX_THOUGHTS_CAP,
  normalizeInt,
} from './engineConfig.js';
import { publishEngineEvent } from './lib/diagnostics.js';
import type {
  ContextSummary,
  ProcessResult,
  StoredThought,
  ThoughtData,
} from './lib/types.js';

export interface ThinkingEngineOptions {
  maxThoughts?: number;
  maxMemoryBytes?: number;
  estimatedThoughtOverheadBytes?: number;
}

interface BranchState {
  thoughts: StoredThought[];
  headIndex: number;
}

export class ThinkingEngine {
  #thoughts: StoredThought[] = [];
  #headIndex = 0;
  #branches = new Map<string, BranchState>();
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
    const totalThoughts = Math.max(input.totalThoughts, input.thoughtNumber);
    const stored: StoredThought = {
      ...input,
      totalThoughts,
      timestamp: Date.now(),
    };
    this.#storeThought(stored);
    this.#pruneHistoryIfNeeded();
    return this.#buildProcessResult(stored);
  }
  #storeThought(stored: StoredThought): void {
    this.#thoughts.push(stored);
    this.#estimatedBytes += this.#estimateThoughtBytes(stored);
    if (stored.isRevision) this.#revisionCount += 1;
    if (!stored.branchId) return;
    const state = this.#branches.get(stored.branchId);
    if (state) {
      state.thoughts.push(stored);
      return;
    }
    this.#branches.set(stored.branchId, {
      thoughts: [stored],
      headIndex: 0,
    });
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
        thoughtHistoryLength: this.#activeLength(),
        branches: Array.from(this.#branches.keys()),
        context,
      },
    };
  }
  #buildContextSummary(): ContextSummary {
    const recent = this.#getRecentThoughts();
    const currentBranch = this.#getLastThought()?.branchId;
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
  #activeLength(): number {
    return this.#thoughts.length - this.#headIndex;
  }
  #getLastThought(): StoredThought | undefined {
    return this.#activeLength() > 0 ? this.#thoughts.at(-1) : undefined;
  }
  #getRecentThoughts(): StoredThought[] {
    const activeLength = this.#activeLength();
    if (activeLength === 0) return [];
    const start = Math.max(this.#headIndex, this.#thoughts.length - 5);
    return this.#thoughts.slice(start);
  }
  #compactIfNeeded(force = false): void {
    if (this.#headIndex === 0) return;
    const activeLength = this.#activeLength();
    if (activeLength === 0) {
      this.#thoughts = [];
      this.#headIndex = 0;
      return;
    }
    if (
      !force &&
      this.#headIndex < COMPACT_THRESHOLD &&
      this.#headIndex < this.#thoughts.length * COMPACT_RATIO
    ) {
      return;
    }
    this.#thoughts = this.#thoughts.slice(this.#headIndex);
    this.#headIndex = 0;
  }
  #validateThoughtNumber(input: ThoughtData): void {
    const lastThought = this.#getLastThought();
    if (!lastThought) {
      if (input.thoughtNumber !== 1) {
        throw new Error(
          `First thought must be number 1, got ${String(input.thoughtNumber)}`
        );
      }
      return;
    }
    if (input.isRevision === true || input.branchFromThought !== undefined) {
      return;
    }
    if (input.thoughtNumber !== lastThought.thoughtNumber + 1) {
      publishEngineEvent({
        type: 'engine.sequence_gap',
        ts: Date.now(),
        expected: lastThought.thoughtNumber + 1,
        received: input.thoughtNumber,
      });
    }
  }
  #validateReferences(input: ThoughtData): void {
    const maxThoughtNumber = this.#getLastThought()?.thoughtNumber ?? 0;
    if (
      input.revisesThought !== undefined &&
      input.revisesThought > maxThoughtNumber
    ) {
      throw new Error(
        `revisesThought ${String(input.revisesThought)} references non-existent thought (max: ${String(maxThoughtNumber)})`
      );
    }
    if (
      input.branchFromThought !== undefined &&
      input.branchFromThought > maxThoughtNumber
    ) {
      throw new Error(
        `branchFromThought ${String(input.branchFromThought)} references non-existent thought (max: ${String(maxThoughtNumber)})`
      );
    }
  }
  #pruneHistoryIfNeeded(): void {
    const excess = this.#activeLength() - this.#maxThoughts;
    if (excess > 0) {
      const batch = Math.max(excess, Math.ceil(this.#maxThoughts * 0.1));
      this.#removeOldest(batch);
    }

    if (
      this.#estimatedBytes > this.#maxMemoryBytes &&
      this.#activeLength() > 10
    ) {
      const toRemove = Math.ceil(this.#activeLength() * 0.2);
      this.#removeOldest(toRemove, { forceCompact: true });
    }
  }
  #estimateThoughtBytes(thought: StoredThought): number {
    return thought.thought.length * 2 + this.#estimatedThoughtOverheadBytes;
  }
  #removeOldest(count: number, options: { forceCompact?: boolean } = {}): void {
    const activeLength = this.#activeLength();
    if (count <= 0 || activeLength === 0) return;
    const actual = Math.min(count, activeLength);
    const start = this.#headIndex;
    const end = start + actual;
    const forceCompact = options.forceCompact ?? false;
    const { branchRemovals, removedBytes, removedRevisions } =
      collectRemovalStats(this.#thoughts, start, end, (thought) =>
        this.#estimateThoughtBytes(thought)
      );
    this.#estimatedBytes -= removedBytes;
    this.#revisionCount -= removedRevisions;
    this.#headIndex = end;
    if (this.#activeLength() === 0) {
      this.#thoughts = [];
      this.#headIndex = 0;
    } else {
      this.#compactIfNeeded(forceCompact);
    }
    for (const [branchId, removeCount] of branchRemovals) {
      this.#trimBranch(branchId, removeCount, forceCompact);
    }
  }
  #trimBranch(
    branchId: string,
    removeCount: number,
    forceCompact: boolean
  ): void {
    const branch = this.#branches.get(branchId);
    if (!branch) return;
    const activeLength = branch.thoughts.length - branch.headIndex;
    if (removeCount >= activeLength) {
      this.#branches.delete(branchId);
      return;
    }
    branch.headIndex += removeCount;
    if (
      !forceCompact &&
      branch.headIndex < COMPACT_THRESHOLD &&
      branch.headIndex < branch.thoughts.length * COMPACT_RATIO
    ) {
      return;
    }
    branch.thoughts = branch.thoughts.slice(branch.headIndex);
    branch.headIndex = 0;
  }
}
