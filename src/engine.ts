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
    if (stored.branchId) {
      const branch = this.#branches.get(stored.branchId) ?? [];
      branch.push(stored);
      this.#branches.set(stored.branchId, branch);
    }

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
    return {
      recentThoughts: recent.map((t) => ({
        number: t.thoughtNumber,
        preview:
          t.thought.slice(0, 100) + (t.thought.length > 100 ? '...' : ''),
        type: t.thoughtType,
      })),
      currentBranch: this.#thoughts.at(-1)?.branchId,
      hasRevisions: this.#thoughts.some((t) => t.isRevision),
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
    let pruned = false;
    const excess = this.#thoughts.length - this.#maxThoughts;
    if (excess > 0) {
      this.#thoughts.splice(0, excess);
      pruned = true;
    }

    const estimatedBytes = this.#thoughts.reduce((sum, t) => {
      return sum + t.thought.length * 2 + this.#estimatedThoughtOverheadBytes;
    }, 0);

    if (estimatedBytes > this.#maxMemoryBytes && this.#thoughts.length > 10) {
      const toRemove = Math.ceil(this.#thoughts.length * 0.2);
      this.#thoughts.splice(0, toRemove);
      pruned = true;
    }

    if (pruned) {
      this.#rebuildBranches();
    }
  }

  #rebuildBranches(): void {
    this.#branches = new Map<string, StoredThought[]>();
    for (const thought of this.#thoughts) {
      if (!thought.branchId) continue;
      const branch = this.#branches.get(thought.branchId) ?? [];
      branch.push(thought);
      this.#branches.set(thought.branchId, branch);
    }
  }
}
