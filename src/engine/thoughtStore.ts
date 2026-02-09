import { COMPACT_RATIO, COMPACT_THRESHOLD } from '../engineConfig.js';
import type { StoredThought } from '../lib/types.js';

export interface ThoughtStoreOptions {
  maxThoughts: number;
  maxMemoryBytes: number;
  estimatedThoughtOverheadBytes: number;
}

export interface PruneStats {
  truncatedActive: boolean;
  droppedActiveCount: number;
  removedThoughtsCount: number;
  oldestAvailableThoughtNumber: number | null;
}

export class ThoughtStore {
  #allThoughts: StoredThought[] = [];
  #byNumber = new Map<number, StoredThought>();
  #activeThoughts: StoredThought[] = [];
  #activeNumbers: number[] = [];
  #activeMaxTotalThoughts = 0;
  #startIndex = 0;
  #nextThoughtNumber = 1;
  #approxBytes = 0;
  #lastPruneStats: PruneStats | null = null;
  readonly #maxThoughts: number;
  readonly #maxMemoryBytes: number;
  readonly #estimatedThoughtOverheadBytes: number;

  constructor(options: ThoughtStoreOptions) {
    this.#maxThoughts = options.maxThoughts;
    this.#maxMemoryBytes = options.maxMemoryBytes;
    this.#estimatedThoughtOverheadBytes = options.estimatedThoughtOverheadBytes;
  }

  nextThoughtNumbers(totalThoughts: number): {
    thoughtNumber: number;
    totalThoughts: number;
  } {
    const thoughtNumber = this.#nextThoughtNumber;
    this.#nextThoughtNumber += 1;

    const effectiveTotalThoughts = Math.max(
      totalThoughts,
      this.#activeMaxTotalThoughts
    );
    return { thoughtNumber, totalThoughts: effectiveTotalThoughts };
  }

  getLastPruneStats(): PruneStats | null {
    return this.#lastPruneStats;
  }

  storeThought(stored: StoredThought): void {
    this.#allThoughts.push(stored);
    this.#byNumber.set(stored.thoughtNumber, stored);

    if (stored.isActive) {
      this.#appendActive(stored);
    }

    this.#approxBytes += this.#estimateThoughtBytes(stored);
  }

  supersedeFrom(
    targetNumber: number,
    supersededBy: number,
    maxSupersedes?: number
  ): { supersedes: number[]; supersedesTotal: number } {
    const startIndex = this.#findActiveIndex(targetNumber);
    if (startIndex < 0) return { supersedes: [], supersedesTotal: 0 };

    const supersedes: number[] = [];
    let supersedesTotal = 0;

    for (let i = startIndex; i < this.#activeThoughts.length; i += 1) {
      const thought = this.#activeThoughts[i];
      if (!thought) continue;

      this.#markSuperseded(thought, supersededBy);
      supersedesTotal += 1;

      if (maxSupersedes === undefined || supersedes.length < maxSupersedes) {
        supersedes.push(thought.thoughtNumber);
      }
    }

    // Drop superseded suffix from active arrays.
    this.#activeThoughts.length = startIndex;
    this.#activeNumbers.length = startIndex;
    this.#recomputeActiveMaxTotalThoughts();

    return { supersedes, supersedesTotal };
  }

  getActiveThoughts(): readonly StoredThought[] {
    return this.#activeThoughts;
  }

  getActiveThoughtNumbers(max?: number): readonly number[] {
    if (max === undefined) return this.#activeNumbers.slice();
    if (max <= 0) return [];
    if (this.#activeNumbers.length <= max) return this.#activeNumbers.slice();
    return this.#activeNumbers.slice(-max);
  }

  getThoughtByNumber(thoughtNumber: number): StoredThought | undefined {
    return this.#byNumber.get(thoughtNumber);
  }

  getTotalLength(): number {
    return this.#allThoughts.length - this.#startIndex;
  }

  pruneHistoryIfNeeded(): void {
    const beforeTotal = this.getTotalLength();
    const beforeActive = this.#activeThoughts.length;

    this.#lastPruneStats = {
      truncatedActive: false,
      droppedActiveCount: 0,
      removedThoughtsCount: 0,
      oldestAvailableThoughtNumber:
        this.#allThoughts[this.#startIndex]?.thoughtNumber ?? null,
    };

    this.#performPruning();
    this.#updatePruneStats(beforeTotal, beforeActive);
  }

  // -------------------------
  // Active-path bookkeeping
  // -------------------------

  #appendActive(stored: StoredThought): void {
    this.#activeThoughts.push(stored);
    this.#activeNumbers.push(stored.thoughtNumber);
    this.#activeMaxTotalThoughts = Math.max(
      this.#activeMaxTotalThoughts,
      stored.totalThoughts
    );
  }

  #markSuperseded(thought: StoredThought, supersededBy: number): void {
    if (!thought.isActive) return;
    thought.isActive = false;
    thought.supersededBy = supersededBy;
  }

  #recomputeActiveMaxTotalThoughts(): void {
    let maxTotal = 0;
    for (const thought of this.#activeThoughts) {
      maxTotal = Math.max(maxTotal, thought.totalThoughts);
    }
    this.#activeMaxTotalThoughts = maxTotal;
  }

  // Binary search lower bound for activeNumbers
  #lowerBoundActive(thoughtNumber: number): number {
    let low = 0;
    let high = this.#activeNumbers.length;

    while (low < high) {
      const mid = (low + high) >>> 1;
      const midValue = this.#activeNumbers[mid];
      if (midValue === undefined) return -1;
      if (midValue < thoughtNumber) low = mid + 1;
      else high = mid;
    }

    return low;
  }

  #findActiveIndex(thoughtNumber: number): number {
    const index = this.#lowerBoundActive(thoughtNumber);
    if (index < 0) return -1;
    return this.#activeNumbers[index] === thoughtNumber ? index : -1;
  }

  #firstActiveIndexAfter(thoughtNumber: number): number {
    const index = this.#lowerBoundActive(thoughtNumber);
    if (index < 0) return 0;
    return this.#activeNumbers[index] === thoughtNumber ? index + 1 : index;
  }

  #dropActiveUpTo(thoughtNumber: number): void {
    if (this.#activeThoughts.length === 0) return;

    const startIndex = this.#firstActiveIndexAfter(thoughtNumber);
    if (startIndex === 0) return;

    this.#activeThoughts = this.#activeThoughts.slice(startIndex);
    this.#activeNumbers = this.#activeNumbers.slice(startIndex);
    this.#recomputeActiveMaxTotalThoughts();
  }

  // -------------------------
  // Pruning / compaction
  // -------------------------

  #performPruning(): void {
    const excess = this.getTotalLength() - this.#maxThoughts;
    if (excess > 0) {
      const batch = Math.max(excess, Math.ceil(this.#maxThoughts * 0.1));
      this.#removeOldest(batch);
    }

    if (
      this.#approxBytes > this.#maxMemoryBytes &&
      this.getTotalLength() > 10
    ) {
      const toRemove = Math.ceil(this.getTotalLength() * 0.2);
      this.#removeOldest(toRemove, { forceCompact: true });
    }
  }

  #updatePruneStats(beforeTotal: number, beforeActive: number): void {
    const stats = this.#lastPruneStats;
    if (!stats) return;

    const afterActive = this.#activeThoughts.length;

    stats.removedThoughtsCount = Math.max(
      0,
      beforeTotal - this.getTotalLength()
    );
    stats.droppedActiveCount = Math.max(0, beforeActive - afterActive);
    stats.truncatedActive = stats.droppedActiveCount > 0;
    stats.oldestAvailableThoughtNumber =
      this.#allThoughts[this.#startIndex]?.thoughtNumber ?? null;
  }

  #estimateThoughtBytes(thought: StoredThought): number {
    return thought.byteLength + this.#estimatedThoughtOverheadBytes;
  }

  #removeOldest(count: number, options: { forceCompact?: boolean } = {}): void {
    const totalLength = this.getTotalLength();
    if (count <= 0 || totalLength === 0) return;

    const actual = Math.min(count, totalLength);
    const start = this.#startIndex;
    const end = start + actual;

    const removedMaxThoughtNumber = this.#evictRange(start, end);

    this.#startIndex = end;

    if (this.getTotalLength() === 0) {
      this.#reset();
      return;
    }

    if (removedMaxThoughtNumber >= 0) {
      this.#dropActiveUpTo(removedMaxThoughtNumber);
    }

    this.#compactIfNeeded(options.forceCompact);
  }

  #evictRange(start: number, end: number): number {
    let removedBytes = 0;
    let maxThoughtNumber = -1;

    for (let index = start; index < end; index += 1) {
      const thought = this.#allThoughts[index];
      if (!thought) continue;

      removedBytes += this.#estimateThoughtBytes(thought);
      this.#byNumber.delete(thought.thoughtNumber);
      maxThoughtNumber = thought.thoughtNumber;
    }

    this.#approxBytes -= removedBytes;
    return maxThoughtNumber;
  }

  #compactIfNeeded(force = false): void {
    if (this.#startIndex === 0) return;

    if (this.getTotalLength() === 0) {
      this.#reset();
      return;
    }

    if (!force && !this.#shouldCompact()) return;

    this.#allThoughts = this.#allThoughts.slice(this.#startIndex);
    this.#startIndex = 0;
  }

  #shouldCompact(): boolean {
    return (
      this.#startIndex >= COMPACT_THRESHOLD ||
      this.#startIndex >= this.#allThoughts.length * COMPACT_RATIO
    );
  }

  #reset(): void {
    this.#allThoughts = [];
    this.#byNumber.clear();
    this.#activeThoughts = [];
    this.#activeNumbers = [];
    this.#activeMaxTotalThoughts = 0;
    this.#startIndex = 0;
    this.#nextThoughtNumber = 1;
    this.#approxBytes = 0;
    this.#lastPruneStats = null;
  }
}
