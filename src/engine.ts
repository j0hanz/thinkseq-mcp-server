import { resolveRevisionTarget } from './engine/revision.js';
import { buildContextSummary } from './engine/thoughtQueries.js';
import { ThoughtStore } from './engine/thoughtStore.js';
import {
  DEFAULT_MAX_THOUGHTS,
  ESTIMATED_THOUGHT_OVERHEAD_BYTES,
  MAX_MEMORY_BYTES,
  MAX_REVISABLE_THOUGHTS,
  MAX_SUPERSEDES,
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

  static readonly DEFAULT_TOTAL_THOUGHTS = 3;

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
    const { stored } = this.#createStoredThought(input);
    this.#commitThought(stored);
    return this.#buildProcessResult(stored);
  }

  #processRevision(input: ThoughtData): ProcessResult {
    const resolved = resolveRevisionTarget(input, (thoughtNumber) =>
      this.#store.getThoughtByNumber(thoughtNumber)
    );
    if (!resolved.ok) return resolved.error;
    const { targetNumber } = resolved;

    const { numbers, stored } = this.#createStoredThought(input, {
      revisionOf: targetNumber,
    });
    const supersedesAll = this.#store.supersedeFrom(
      targetNumber,
      numbers.thoughtNumber
    );
    const supersedesTotal = supersedesAll.length;
    const supersedes = capArrayStart(supersedesAll, MAX_SUPERSEDES);

    this.#hasRevisions = true;
    this.#commitThought(stored);

    return this.#buildProcessResult(stored, {
      revises: targetNumber,
      supersedes,
      supersedesTotal,
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
      thought: input.thought,
      ...(input.revisesThought !== undefined && {
        revisesThought: input.revisesThought,
      }),
      thoughtNumber: details.thoughtNumber,
      totalThoughts: details.totalThoughts,
      timestamp: Date.now(),
      isActive: true,
      ...(details.revisionOf !== undefined && {
        revisionOf: details.revisionOf,
      }),
    };
  }

  #createStoredThought(
    input: ThoughtData,
    extras: { revisionOf?: number } = {}
  ): {
    stored: StoredThought;
    numbers: { thoughtNumber: number; totalThoughts: number };
  } {
    const effectiveTotalThoughts = this.#resolveEffectiveTotalThoughts(input);
    const numbers = this.#store.nextThoughtNumbers(effectiveTotalThoughts);
    const stored = this.#buildStoredThought(input, {
      ...numbers,
      ...extras,
    });
    return { stored, numbers };
  }

  #commitThought(stored: StoredThought): void {
    this.#store.storeThought(stored);
    this.#store.pruneHistoryIfNeeded();
  }

  #resolveEffectiveTotalThoughts(input: ThoughtData): number {
    if (input.totalThoughts !== undefined) {
      return input.totalThoughts;
    }

    const activeThoughts = this.#store.getActiveThoughts();
    const lastActive = activeThoughts[activeThoughts.length - 1];
    if (
      lastActive !== undefined &&
      lastActive.totalThoughts > ThinkingEngine.DEFAULT_TOTAL_THOUGHTS
    ) {
      return lastActive.totalThoughts;
    }

    return ThinkingEngine.DEFAULT_TOTAL_THOUGHTS;
  }

  #buildProcessResult(
    stored: StoredThought,
    revisionInfo?: RevisionInfo
  ): ProcessResult {
    const activeThoughts = this.#store.getActiveThoughts();
    const context = buildContextSummary(activeThoughts, revisionInfo);
    const isComplete = stored.thoughtNumber >= stored.totalThoughts;
    const revisableThoughtsAll = this.#store.getActiveThoughtNumbers();
    const revisableThoughtsTotal = revisableThoughtsAll.length;
    const revisableThoughts = capArrayEnd(
      revisableThoughtsAll,
      MAX_REVISABLE_THOUGHTS
    );

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
        revisableThoughtsTotal,
        context,
      },
    };
  }
}

function capArrayStart(values: readonly number[], max: number): number[] {
  if (values.length <= max) return values.slice();
  return values.slice(0, max);
}

function capArrayEnd(values: readonly number[], max: number): number[] {
  if (values.length <= max) return values.slice();
  return values.slice(-max);
}
