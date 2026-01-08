import { collectRemovedBytes } from './engine/pruning.js';
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
  ContextSummary,
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
    const thoughtNumber = this.#totalLength() + 1;
    const totalThoughts = Math.max(input.totalThoughts, thoughtNumber);
    const stored: StoredThought = {
      ...input,
      thoughtNumber,
      totalThoughts,
      timestamp: Date.now(),
      isActive: true,
    };
    this.#storeThought(stored);
    this.#pruneHistoryIfNeeded();
    return this.#buildProcessResult(stored);
  }

  #processRevision(input: ThoughtData): ProcessResult {
    const targetNumber = input.revisesThought;
    if (targetNumber === undefined) {
      return {
        ok: false,
        error: {
          code: 'E_REVISION_MISSING',
          message: 'revisesThought is required for revision',
        },
      };
    }
    const target = this.#findThoughtByNumber(targetNumber);

    if (!target) {
      return {
        ok: false,
        error: {
          code: 'E_REVISION_TARGET_NOT_FOUND',
          message: `Thought ${targetNumber} not found`,
        },
      };
    }

    if (!target.isActive) {
      return {
        ok: false,
        error: {
          code: 'E_REVISION_TARGET_SUPERSEDED',
          message: `Thought ${targetNumber} was already superseded`,
        },
      };
    }

    const thoughtNumber = this.#totalLength() + 1;
    const totalThoughts = Math.max(input.totalThoughts, thoughtNumber);

    const supersedes = this.#collectSupersededChain(targetNumber);

    for (const num of supersedes) {
      const thought = this.#findThoughtByNumber(num);
      if (thought?.isActive) {
        thought.isActive = false;
        thought.supersededBy = thoughtNumber;
      }
    }

    const stored: StoredThought = {
      ...input,
      thoughtNumber,
      totalThoughts,
      timestamp: Date.now(),
      isActive: true,
      revisionOf: targetNumber,
    };

    this.#storeThought(stored);
    this.#hasRevisions = true;
    this.#pruneHistoryIfNeeded();

    const revisionInfo: RevisionInfo = { revises: targetNumber, supersedes };
    return this.#buildProcessResult(stored, revisionInfo);
  }

  #findThoughtByNumber(num: number): StoredThought | undefined {
    for (let i = this.#headIndex; i < this.#thoughts.length; i++) {
      const thought = this.#thoughts[i];
      if (thought?.thoughtNumber === num) {
        return thought;
      }
    }
    return undefined;
  }

  #collectSupersededChain(fromNumber: number): number[] {
    const result: number[] = [];
    for (let i = this.#headIndex; i < this.#thoughts.length; i++) {
      const t = this.#thoughts[i];
      if (t && t.thoughtNumber >= fromNumber && t.isActive) {
        result.push(t.thoughtNumber);
      }
    }
    return result;
  }

  #storeThought(stored: StoredThought): void {
    this.#thoughts.push(stored);
    this.#estimatedBytes += this.#estimateThoughtBytes(stored);
  }

  #buildProcessResult(
    stored: StoredThought,
    revisionInfo?: RevisionInfo
  ): ProcessResult {
    const context = this.#buildContextSummary(revisionInfo);
    const isComplete = stored.thoughtNumber >= stored.totalThoughts;
    const activePathLength = this.#activeLength();
    const revisableThoughts = this.#getRevisableThoughts();

    return {
      ok: true,
      result: {
        thoughtNumber: stored.thoughtNumber,
        totalThoughts: stored.totalThoughts,
        progress: Math.min(1, stored.thoughtNumber / stored.totalThoughts),
        isComplete,
        thoughtHistoryLength: this.#totalLength(),
        hasRevisions: this.#hasRevisions,
        activePathLength,
        revisableThoughts,
        context,
      },
    };
  }

  #buildContextSummary(revisionInfo?: RevisionInfo): ContextSummary {
    const recent = this.#getRecentActiveThoughts();
    const recentThoughts = recent.map((t) => ({
      number: t.thoughtNumber,
      preview: t.thought.slice(0, 100) + (t.thought.length > 100 ? '...' : ''),
    }));

    if (revisionInfo !== undefined) {
      return { recentThoughts, revisionInfo };
    }
    return { recentThoughts };
  }

  #totalLength(): number {
    return this.#thoughts.length - this.#headIndex;
  }

  #activeLength(): number {
    let count = 0;
    for (let i = this.#headIndex; i < this.#thoughts.length; i++) {
      const thought = this.#thoughts[i];
      if (thought?.isActive) count++;
    }
    return count;
  }

  #getRevisableThoughts(): number[] {
    const result: number[] = [];
    for (let i = this.#headIndex; i < this.#thoughts.length; i++) {
      const t = this.#thoughts[i];
      if (t?.isActive) {
        result.push(t.thoughtNumber);
      }
    }
    return result;
  }

  #getRecentActiveThoughts(): StoredThought[] {
    const active: StoredThought[] = [];
    for (let i = this.#headIndex; i < this.#thoughts.length; i++) {
      const thought = this.#thoughts[i];
      if (thought?.isActive) {
        active.push(thought);
      }
    }
    return active.slice(-5);
  }

  #compactIfNeeded(force = false): void {
    if (this.#headIndex === 0) return;
    const totalLength = this.#totalLength();
    if (totalLength === 0) {
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
      this.#thoughts = [];
      this.#headIndex = 0;
    } else {
      this.#compactIfNeeded(forceCompact);
    }
  }
}
