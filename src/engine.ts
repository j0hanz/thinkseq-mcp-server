import { resolveRevisionTarget } from './engine/revision.js';
import { buildContextSummary } from './engine/thoughtQueries.js';
import { ThoughtStore } from './engine/thoughtStore.js';
import {
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
  #store: ThoughtStore;
  #hasRevisions = false;

  constructor(options: ThinkingEngineOptions = {}) {
    const maxThoughts = normalizeInt(
      options.maxThoughts,
      DEFAULT_MAX_THOUGHTS,
      { min: 1, max: MAX_THOUGHTS_CAP }
    );
    const maxMemoryBytes = normalizeInt(
      options.maxMemoryBytes,
      MAX_MEMORY_BYTES,
      { min: 1, max: Number.MAX_SAFE_INTEGER }
    );
    const estimatedThoughtOverheadBytes = normalizeInt(
      options.estimatedThoughtOverheadBytes,
      ESTIMATED_THOUGHT_OVERHEAD_BYTES,
      { min: 1, max: Number.MAX_SAFE_INTEGER }
    );

    this.#store = new ThoughtStore({
      maxThoughts,
      maxMemoryBytes,
      estimatedThoughtOverheadBytes,
    });
  }

  processThought(input: ThoughtData): ProcessResult {
    if (input.revisesThought !== undefined) {
      return this.#processRevision(input);
    }
    return this.#processNewThought(input);
  }

  #processNewThought(input: ThoughtData): ProcessResult {
    const numbers = this.#store.nextThoughtNumbers(input.totalThoughts);
    const stored = this.#buildStoredThought(input, numbers);
    this.#store.storeThought(stored);
    this.#store.pruneHistoryIfNeeded();
    return this.#buildProcessResult(stored);
  }

  #processRevision(input: ThoughtData): ProcessResult {
    const resolved = resolveRevisionTarget(input, (thoughtNumber) =>
      this.#store.getThoughtByNumber(thoughtNumber)
    );
    if (!resolved.ok) return resolved.error;
    const { targetNumber } = resolved;

    const numbers = this.#store.nextThoughtNumbers(input.totalThoughts);
    const supersedes = this.#store.supersedeFrom(
      targetNumber,
      numbers.thoughtNumber
    );

    const stored = this.#buildStoredThought(input, {
      ...numbers,
      revisionOf: targetNumber,
    });

    this.#store.storeThought(stored);
    this.#hasRevisions = true;
    this.#store.pruneHistoryIfNeeded();

    return this.#buildProcessResult(stored, {
      revises: targetNumber,
      supersedes,
    });
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

  #buildProcessResult(
    stored: StoredThought,
    revisionInfo?: RevisionInfo
  ): ProcessResult {
    const activeThoughts = this.#store.getActiveThoughts();
    const context = buildContextSummary(activeThoughts, revisionInfo);
    const isComplete = stored.thoughtNumber >= stored.totalThoughts;
    const revisableThoughts = this.#store.getActiveThoughtNumbers().slice();

    return {
      ok: true,
      result: {
        thoughtNumber: stored.thoughtNumber,
        totalThoughts: stored.totalThoughts,
        progress: Math.min(1, stored.thoughtNumber / stored.totalThoughts),
        isComplete,
        thoughtHistoryLength: this.#store.getTotalLength(),
        hasRevisions: this.#hasRevisions,
        activePathLength: activeThoughts.length,
        revisableThoughts,
        context,
      },
    };
  }
}
