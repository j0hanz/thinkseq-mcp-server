import { collectRemovedBytes } from './engine/pruning.js';
import { resolveRevisionTarget } from './engine/revision.js';
import {
  buildContextSummary,
  collectSupersededChain,
  findThoughtByNumber,
  getActiveThoughts,
  getRevisableThoughtNumbers,
} from './engine/thoughtQueries.js';
import {
  COMPACT_RATIO,
  COMPACT_THRESHOLD,
  DEFAULT_MAX_THOUGHTS,
  ESTIMATED_THOUGHT_OVERHEAD_BYTES,
  MAX_MEMORY_BYTES,
  MAX_THOUGHTS_CAP,
  normalizeInt,
} from './engineConfig.js';
import type {
  ProcessResult,
  RevisionInfo,
  StoredThought,
  ThoughtData,
} from './lib/types.js';

export interface ThinkingEngineOptions {
  maxThoughts?: number;
  maxMemoryBytes?: number;
  estimatedThoughtOverheadBytes?: number;
}

export class ThinkingEngine {
  #thoughts: StoredThought[] = [];
  #headIndex = 0;
  #estimatedBytes = 0;
  #hasRevisions = false;
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
    if (input.revisesThought !== undefined) {
      return this.#processRevision(input);
    }
    return this.#processNewThought(input);
  }

  #processNewThought(input: ThoughtData): ProcessResult {
    const numbers = this.#nextThoughtNumbers(input.totalThoughts);
    const stored = this.#buildStoredThought(input, numbers);
    this.#storeThought(stored);
    this.#pruneHistoryIfNeeded();
    return this.#buildProcessResult(stored);
  }

  #processRevision(input: ThoughtData): ProcessResult {
    const resolved = resolveRevisionTarget(
      input,
      this.#thoughts,
      this.#headIndex
    );
    if (!resolved.ok) return resolved.error;
    const { targetNumber } = resolved;

    const numbers = this.#nextThoughtNumbers(input.totalThoughts);
    const supersedes = collectSupersededChain(
      this.#thoughts,
      this.#headIndex,
      targetNumber
    );
    this.#applySupersedes(supersedes, numbers.thoughtNumber);

    const stored = this.#buildStoredThought(input, {
      ...numbers,
      revisionOf: targetNumber,
    });

    this.#storeThought(stored);
    this.#hasRevisions = true;
    this.#pruneHistoryIfNeeded();

    return this.#buildProcessResult(stored, {
      revises: targetNumber,
      supersedes,
    });
  }

  #nextThoughtNumbers(totalThoughts: number): {
    thoughtNumber: number;
    totalThoughts: number;
  } {
    const thoughtNumber = this.#totalLength() + 1;
    return {
      thoughtNumber,
      totalThoughts: Math.max(totalThoughts, thoughtNumber),
    };
  }

  #buildStoredThought(
    input: ThoughtData,
    details: {
      thoughtNumber: number;
      totalThoughts: number;
      revisionOf?: number;
    }
  ): StoredThought {
    return {
      ...input,
      thoughtNumber: details.thoughtNumber,
      totalThoughts: details.totalThoughts,
      timestamp: Date.now(),
      isActive: true,
      ...(details.revisionOf !== undefined && {
        revisionOf: details.revisionOf,
      }),
    };
  }

  #applySupersedes(supersedes: number[], supersededBy: number): void {
    for (const num of supersedes) {
      const thought = findThoughtByNumber(this.#thoughts, this.#headIndex, num);
      if (thought?.isActive) {
        thought.isActive = false;
        thought.supersededBy = supersededBy;
      }
    }
  }

  #storeThought(stored: StoredThought): void {
    this.#thoughts.push(stored);
    this.#estimatedBytes += this.#estimateThoughtBytes(stored);
  }

  #buildProcessResult(
    stored: StoredThought,
    revisionInfo?: RevisionInfo
  ): ProcessResult {
    const activeThoughts = getActiveThoughts(this.#thoughts, this.#headIndex);
    const context = buildContextSummary(activeThoughts, revisionInfo);
    const isComplete = stored.thoughtNumber >= stored.totalThoughts;
    const revisableThoughts = getRevisableThoughtNumbers(activeThoughts);

    return {
      ok: true,
      result: {
        thoughtNumber: stored.thoughtNumber,
        totalThoughts: stored.totalThoughts,
        progress: Math.min(1, stored.thoughtNumber / stored.totalThoughts),
        isComplete,
        thoughtHistoryLength: this.#totalLength(),
        hasRevisions: this.#hasRevisions,
        activePathLength: activeThoughts.length,
        revisableThoughts,
        context,
      },
    };
  }

  #totalLength(): number {
    return this.#thoughts.length - this.#headIndex;
  }

  #compactIfNeeded(force = false): void {
    if (this.#headIndex === 0) return;
    const totalLength = this.#totalLength();
    if (totalLength === 0) {
      this.#resetThoughts();
      return;
    }
    if (!this.#shouldCompact(force)) return;
    this.#thoughts = this.#thoughts.slice(this.#headIndex);
    this.#headIndex = 0;
  }

  #shouldCompact(force: boolean): boolean {
    if (force) return true;
    return !(
      this.#headIndex < COMPACT_THRESHOLD &&
      this.#headIndex < this.#thoughts.length * COMPACT_RATIO
    );
  }

  #pruneHistoryIfNeeded(): void {
    const excess = this.#totalLength() - this.#maxThoughts;
    if (excess > 0) {
      const batch = Math.max(excess, Math.ceil(this.#maxThoughts * 0.1));
      this.#removeOldest(batch);
    }

    if (
      this.#estimatedBytes > this.#maxMemoryBytes &&
      this.#totalLength() > 10
    ) {
      const toRemove = Math.ceil(this.#totalLength() * 0.2);
      this.#removeOldest(toRemove, { forceCompact: true });
    }
  }

  #estimateThoughtBytes(thought: StoredThought): number {
    return thought.thought.length * 2 + this.#estimatedThoughtOverheadBytes;
  }

  #removeOldest(count: number, options: { forceCompact?: boolean } = {}): void {
    const totalLength = this.#totalLength();
    if (count <= 0 || totalLength === 0) return;
    const actual = Math.min(count, totalLength);
    const start = this.#headIndex;
    const end = start + actual;
    const forceCompact = options.forceCompact ?? false;
    const removedBytes = collectRemovedBytes(
      this.#thoughts,
      start,
      end,
      (thought) => this.#estimateThoughtBytes(thought)
    );
    this.#estimatedBytes -= removedBytes;
    this.#headIndex = end;
    if (this.#totalLength() === 0) {
      this.#resetThoughts();
      return;
    }
    this.#compactIfNeeded(forceCompact);
  }

  #resetThoughts(): void {
    this.#thoughts = [];
    this.#headIndex = 0;
  }
}
