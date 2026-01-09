import { resolveRevisionTarget } from './engine/revision.js';
import { buildContextSummary } from './engine/thoughtQueries.js';
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
  #thoughtIndex = new Map<number, StoredThought>();
  #activeThoughts: StoredThought[] = [];
  #activeThoughtNumbers: number[] = [];
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
    const resolved = resolveRevisionTarget(input, (thoughtNumber) =>
      this.#thoughtIndex.get(thoughtNumber)
    );
    if (!resolved.ok) return resolved.error;
    const { targetNumber } = resolved;

    const numbers = this.#nextThoughtNumbers(input.totalThoughts);
    const supersedes = this.#supersedeFrom(targetNumber, numbers.thoughtNumber);

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

  #supersedeFrom(targetNumber: number, supersededBy: number): number[] {
    const startIndex = this.#activeThoughtNumbers.indexOf(targetNumber);
    if (startIndex < 0) return [];
    const supersedes: number[] = [];
    for (let i = startIndex; i < this.#activeThoughts.length; i += 1) {
      const thought = this.#activeThoughts[i];
      if (!thought) continue;
      if (thought.isActive) {
        thought.isActive = false;
        thought.supersededBy = supersededBy;
      }
      supersedes.push(thought.thoughtNumber);
    }
    this.#activeThoughts.length = startIndex;
    this.#activeThoughtNumbers.length = startIndex;
    return supersedes;
  }

  #storeThought(stored: StoredThought): void {
    this.#thoughts.push(stored);
    this.#thoughtIndex.set(stored.thoughtNumber, stored);
    if (stored.isActive) {
      this.#activeThoughts.push(stored);
      this.#activeThoughtNumbers.push(stored.thoughtNumber);
    }
    this.#estimatedBytes += this.#estimateThoughtBytes(stored);
  }

  #buildProcessResult(
    stored: StoredThought,
    revisionInfo?: RevisionInfo
  ): ProcessResult {
    const activeThoughts = this.#activeThoughts;
    const context = buildContextSummary(activeThoughts, revisionInfo);
    const isComplete = stored.thoughtNumber >= stored.totalThoughts;
    const revisableThoughts = this.#activeThoughtNumbers.slice();

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

  #dropActiveThoughtsUpTo(thoughtNumber: number): void {
    if (this.#activeThoughts.length === 0) return;
    let startIndex = 0;
    while (startIndex < this.#activeThoughts.length) {
      const thought = this.#activeThoughts[startIndex];
      if (!thought || thought.thoughtNumber > thoughtNumber) break;
      startIndex += 1;
    }
    if (startIndex === 0) return;
    this.#activeThoughts = this.#activeThoughts.slice(startIndex);
    this.#activeThoughtNumbers = this.#activeThoughtNumbers.slice(startIndex);
  }

  #removeOldest(count: number, options: { forceCompact?: boolean } = {}): void {
    const totalLength = this.#totalLength();
    if (count <= 0 || totalLength === 0) return;
    const actual = Math.min(count, totalLength);
    const start = this.#headIndex;
    const end = start + actual;
    const forceCompact = options.forceCompact ?? false;
    let removedBytes = 0;
    let removedMaxThoughtNumber = -1;
    for (let index = start; index < end; index += 1) {
      const thought = this.#thoughts[index];
      if (!thought) continue;
      removedBytes += this.#estimateThoughtBytes(thought);
      this.#thoughtIndex.delete(thought.thoughtNumber);
      removedMaxThoughtNumber = thought.thoughtNumber;
    }
    this.#estimatedBytes -= removedBytes;
    this.#headIndex = end;
    if (this.#totalLength() === 0) {
      this.#resetThoughts();
      return;
    }
    if (removedMaxThoughtNumber >= 0) {
      this.#dropActiveThoughtsUpTo(removedMaxThoughtNumber);
    }
    this.#compactIfNeeded(forceCompact);
  }

  #resetThoughts(): void {
    this.#thoughts = [];
    this.#thoughtIndex.clear();
    this.#activeThoughts = [];
    this.#activeThoughtNumbers = [];
    this.#headIndex = 0;
    this.#estimatedBytes = 0;
  }
}
