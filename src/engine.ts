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
  maxSessions?: number;
}

interface SessionState {
  store: ThoughtStore;
  hasRevisions: boolean;
}

export class ThinkingEngine {
  static readonly DEFAULT_TOTAL_THOUGHTS = 3;

  readonly #maxThoughts: number;
  readonly #maxMemoryBytes: number;
  readonly #estimatedThoughtOverheadBytes: number;
  readonly #maxSessions: number;
  readonly #sessions = new Map<string, SessionState>();

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
    this.#maxSessions = normalizeInt(options.maxSessions, 50, {
      min: 1,
      max: 10_000,
    });
    this.#getSession('default');
  }

  processThought(input: ThoughtData): ProcessResult {
    return this.processThoughtWithSession('default', input);
  }

  processThoughtWithSession(
    sessionId: string,
    input: ThoughtData
  ): ProcessResult {
    const session = this.#getSession(sessionId);

    if (input.revisesThought !== undefined) {
      return this.#processRevision(session, input);
    }
    return this.#processNewThought(session, input);
  }

  #getSession(sessionId: string): SessionState {
    const key = sessionId.trim() || 'default';

    const existing = this.#sessions.get(key);
    if (existing) {
      // bump to most-recent for LRU eviction
      this.#sessions.delete(key);
      this.#sessions.set(key, existing);
      return existing;
    }

    const state: SessionState = {
      store: new ThoughtStore({
        maxThoughts: this.#maxThoughts,
        maxMemoryBytes: this.#maxMemoryBytes,
        estimatedThoughtOverheadBytes: this.#estimatedThoughtOverheadBytes,
      }),
      hasRevisions: false,
    };

    this.#sessions.set(key, state);
    this.#evictSessionsIfNeeded();

    return state;
  }

  #evictSessionsIfNeeded(): void {
    while (this.#sessions.size > this.#maxSessions) {
      const oldestKey = this.#sessions.keys().next().value;
      if (!oldestKey) return;
      if (oldestKey === 'default') {
        const def = this.#sessions.get('default');
        if (!def) return;
        this.#sessions.delete('default');
        this.#sessions.set('default', def);
        continue;
      }
      this.#sessions.delete(oldestKey);
    }
  }

  #processNewThought(session: SessionState, input: ThoughtData): ProcessResult {
    const { stored } = this.#createStoredThought(session.store, input);
    this.#commitThought(session.store, stored);
    return this.#buildProcessResult(session, stored);
  }

  #processRevision(session: SessionState, input: ThoughtData): ProcessResult {
    const { store } = session;

    const resolved = resolveRevisionTarget(input, (thoughtNumber) =>
      store.getThoughtByNumber(thoughtNumber)
    );
    if (!resolved.ok) return resolved.result;

    const { targetNumber } = resolved;

    const { numbers, stored } = this.#createStoredThought(store, input, {
      revisionOf: targetNumber,
      fallbackTotalThoughts: resolved.target.totalThoughts,
    });
    const { supersedes, supersedesTotal } = store.supersedeFrom(
      targetNumber,
      numbers.thoughtNumber,
      MAX_SUPERSEDES
    );

    session.hasRevisions = true;
    this.#commitThought(store, stored);

    return this.#buildProcessResult(session, stored, {
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
      byteLength: Buffer.byteLength(input.thought),
    };
  }

  #createStoredThought(
    store: ThoughtStore,
    input: ThoughtData,
    extras: { revisionOf?: number; fallbackTotalThoughts?: number } = {}
  ): {
    stored: StoredThought;
    numbers: { thoughtNumber: number; totalThoughts: number };
  } {
    const effectiveTotalThoughts = this.#resolveEffectiveTotalThoughts(
      store,
      input,
      extras.fallbackTotalThoughts
    );
    const numbers = store.nextThoughtNumbers(effectiveTotalThoughts);
    const stored = this.#buildStoredThought(input, {
      ...numbers,
      ...(extras.revisionOf !== undefined && { revisionOf: extras.revisionOf }),
    });
    return { stored, numbers };
  }

  #commitThought(store: ThoughtStore, stored: StoredThought): void {
    store.storeThought(stored);
    store.pruneHistoryIfNeeded();
  }

  #resolveEffectiveTotalThoughts(
    store: ThoughtStore,
    input: ThoughtData,
    fallback?: number
  ): number {
    if (input.totalThoughts !== undefined) {
      return normalizeInt(
        input.totalThoughts,
        ThinkingEngine.DEFAULT_TOTAL_THOUGHTS,
        { min: 1, max: MAX_THOUGHTS_CAP }
      );
    }

    if (fallback !== undefined) return fallback;

    const activeThoughts = store.getActiveThoughts();
    const lastActive = activeThoughts[activeThoughts.length - 1];
    if (lastActive !== undefined) {
      return lastActive.totalThoughts;
    }

    return ThinkingEngine.DEFAULT_TOTAL_THOUGHTS;
  }

  #buildProcessResult(
    session: SessionState,
    stored: StoredThought,
    revisionInfo?: RevisionInfo
  ): ProcessResult {
    const activeThoughts = session.store.getActiveThoughts();
    const activePathLength = activeThoughts.length;
    const { progress, isComplete } = this.#calculateMetrics(
      activePathLength,
      stored.totalThoughts
    );

    return {
      ok: true,
      result: {
        thoughtNumber: stored.thoughtNumber,
        totalThoughts: stored.totalThoughts,
        progress,
        isComplete,
        thoughtHistoryLength: session.store.getTotalLength(),
        hasRevisions: session.hasRevisions,
        activePathLength,
        revisableThoughts: session.store.getActiveThoughtNumbers(
          MAX_REVISABLE_THOUGHTS
        ),
        revisableThoughtsTotal: activePathLength,
        context: buildContextSummary(activeThoughts, revisionInfo),
      },
    };
  }

  #calculateMetrics(
    active: number,
    total: number
  ): { progress: number; isComplete: boolean } {
    return {
      progress: total > 0 ? Math.min(1, active / total) : 1,
      isComplete: active >= total,
    };
  }
}
