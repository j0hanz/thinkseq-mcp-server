import { Buffer } from 'node:buffer';

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

class PinnedLruSessions<T> {
  readonly #map = new Map<string, T>();
  readonly #pinnedKey: string;
  readonly #max: number;

  constructor(pinnedKey: string, max: number) {
    this.#pinnedKey = pinnedKey;
    this.#max = max;
  }

  get size(): number {
    return this.#map.size;
  }

  get(key: string): T | undefined {
    const existing = this.#map.get(key);
    if (!existing) return undefined;

    // bump to most-recent
    this.#map.delete(key);
    this.#map.set(key, existing);
    return existing;
  }

  set(key: string, value: T): void {
    if (this.#map.has(key)) this.#map.delete(key);
    this.#map.set(key, value);
    this.#evictIfNeeded();
  }

  #evictIfNeeded(): void {
    while (this.#map.size > this.#max) {
      const oldestKey: string | undefined = this.#map.keys().next().value;
      if (!oldestKey) return;

      if (oldestKey === this.#pinnedKey) {
        const pinned = this.#map.get(this.#pinnedKey);
        if (!pinned) {
          // Invariant broken; safest is to stop evicting.
          return;
        }
        // Move pinned to most-recent and try again.
        this.#map.delete(this.#pinnedKey);
        this.#map.set(this.#pinnedKey, pinned);
        continue;
      }

      this.#map.delete(oldestKey);
    }
  }
}

function normalizeSessionId(sessionId: string): string {
  const key = sessionId.trim();
  return key.length > 0 ? key : 'default';
}

export class ThinkingEngine {
  static readonly DEFAULT_TOTAL_THOUGHTS = 3;

  readonly #maxThoughts: number;
  readonly #maxMemoryBytes: number;
  readonly #estimatedThoughtOverheadBytes: number;
  readonly #sessions: PinnedLruSessions<SessionState>;

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

    const maxSessions = normalizeInt(options.maxSessions, 50, {
      min: 1,
      max: 10_000,
    });

    this.#sessions = new PinnedLruSessions<SessionState>(
      'default',
      maxSessions
    );
    this.#getOrCreateSession('default');
  }

  processThought(input: ThoughtData): ProcessResult {
    return this.processThoughtWithSession('default', input);
  }

  processThoughtWithSession(
    sessionId: string,
    input: ThoughtData
  ): ProcessResult {
    const session = this.#getOrCreateSession(sessionId);
    return input.revisesThought !== undefined
      ? this.#processRevision(session, input)
      : this.#processNewThought(session, input);
  }

  #getOrCreateSession(sessionId: string): SessionState {
    const key = normalizeSessionId(sessionId);

    const existing = this.#sessions.get(key);
    if (existing) return existing;

    const state: SessionState = {
      store: new ThoughtStore({
        maxThoughts: this.#maxThoughts,
        maxMemoryBytes: this.#maxMemoryBytes,
        estimatedThoughtOverheadBytes: this.#estimatedThoughtOverheadBytes,
      }),
      hasRevisions: false,
    };

    this.#sessions.set(key, state);
    return state;
  }

  #processNewThought(session: SessionState, input: ThoughtData): ProcessResult {
    const stored = this.#createStoredThought(session.store, input);
    this.#commit(session.store, stored);
    return this.#buildProcessResult(session, stored);
  }

  #processRevision(session: SessionState, input: ThoughtData): ProcessResult {
    const { store } = session;

    const resolved = resolveRevisionTarget(input, (thoughtNumber) =>
      store.getThoughtByNumber(thoughtNumber)
    );
    if (!resolved.ok) return resolved.result;

    const { targetNumber } = resolved;

    const stored = this.#createStoredThought(store, input, {
      revisionOf: targetNumber,
      fallbackTotalThoughts: resolved.target.totalThoughts,
    });

    const { supersedes, supersedesTotal } = store.supersedeFrom(
      targetNumber,
      stored.thoughtNumber,
      MAX_SUPERSEDES
    );

    session.hasRevisions = true;
    this.#commit(store, stored);

    return this.#buildProcessResult(session, stored, {
      revises: targetNumber,
      supersedes,
      supersedesTotal,
    });
  }

  #commit(store: ThoughtStore, stored: StoredThought): void {
    store.storeThought(stored);
    store.pruneHistoryIfNeeded();
  }

  #createStoredThought(
    store: ThoughtStore,
    input: ThoughtData,
    extras: { revisionOf?: number; fallbackTotalThoughts?: number } = {}
  ): StoredThought {
    const totalThoughts = this.#resolveEffectiveTotalThoughts(
      store,
      input,
      extras.fallbackTotalThoughts
    );

    const numbers = store.nextThoughtNumbers(totalThoughts);

    return this.#buildStoredThought(input, {
      ...numbers,
      ...(extras.revisionOf !== undefined && { revisionOf: extras.revisionOf }),
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
      byteLength: Buffer.byteLength(input.thought, 'utf8'),
    };
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
    return lastActive?.totalThoughts ?? ThinkingEngine.DEFAULT_TOTAL_THOUGHTS;
  }

  #buildProcessResult(
    session: SessionState,
    stored: StoredThought,
    revisionInfo?: RevisionInfo
  ): ProcessResult {
    const activeThoughts = session.store.getActiveThoughts();
    const activePathLength = activeThoughts.length;

    const { progress, isComplete } = this.#calculateProgress(
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

  #calculateProgress(
    active: number,
    total: number
  ): { progress: number; isComplete: boolean } {
    const safeTotal = total > 0 ? total : 0;
    const progress = safeTotal > 0 ? Math.min(1, active / safeTotal) : 1;
    return { progress, isComplete: active >= safeTotal };
  }
}
