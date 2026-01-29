import { COMPACT_RATIO, COMPACT_THRESHOLD } from '../engineConfig.js';
import type { StoredThought } from '../lib/types.js';

export interface ThoughtStoreOptions {
  maxThoughts: number;
  maxMemoryBytes: number;
  estimatedThoughtOverheadBytes: number;
}

export class ThoughtStore {
  #thoughts: StoredThought[] = [];
  #thoughtIndex = new Map<number, StoredThought>();
  #activeThoughts: StoredThought[] = [];
  #activeThoughtNumbers: number[] = [];
  #activeMaxTotalThoughts = 0;
  #headIndex = 0;
  #nextThoughtNumber = 1;
  #estimatedBytes = 0;
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
      thoughtNumber,
      this.#activeMaxTotalThoughts
    );
    return {
      thoughtNumber,
      totalThoughts: effectiveTotalThoughts,
    };
  }

  storeThought(stored: StoredThought): void {
    this.#thoughts.push(stored);
    this.#thoughtIndex.set(stored.thoughtNumber, stored);
    if (stored.isActive) {
      this.#activeThoughts.push(stored);
      this.#activeThoughtNumbers.push(stored.thoughtNumber);
      this.#activeMaxTotalThoughts = Math.max(
        this.#activeMaxTotalThoughts,
        stored.totalThoughts
      );
    }
    this.#estimatedBytes += this.#estimateThoughtBytes(stored);
  }

  #recomputeActiveMaxTotalThoughts(): void {
    let maxTotal = 0;
    for (const thought of this.#activeThoughts) {
      maxTotal = Math.max(maxTotal, thought.totalThoughts);
    }
    this.#activeMaxTotalThoughts = maxTotal;
  }

  #findActiveThoughtIndex(thoughtNumber: number): number {
    const activeThoughtNumbers = this.#activeThoughtNumbers;
    let low = 0;
    let high = activeThoughtNumbers.length;
    while (low < high) {
      const mid = (low + high) >>> 1;
      const midValue = activeThoughtNumbers[mid];

      if (midValue === undefined) {
        return -1;
      }

      if (midValue < thoughtNumber) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }
    if (
      low < activeThoughtNumbers.length &&
      activeThoughtNumbers[low] === thoughtNumber
    ) {
      return low;
    }
    return -1;
  }

  supersedeFrom(
    targetNumber: number,
    supersededBy: number,
    maxSupersedes?: number
  ): { supersedes: number[]; supersedesTotal: number } {
    const startIndex = this.#findActiveThoughtIndex(targetNumber);
    if (startIndex < 0) return { supersedes: [], supersedesTotal: 0 };
    const supersedes: number[] = [];
    let supersedesTotal = 0;
    for (let i = startIndex; i < this.#activeThoughts.length; i += 1) {
      const thought = this.#activeThoughts[i];
      if (!thought) continue;
      if (thought.isActive) {
        thought.isActive = false;
        thought.supersededBy = supersededBy;
      }
      supersedesTotal += 1;
      if (maxSupersedes === undefined || supersedes.length < maxSupersedes) {
        supersedes.push(thought.thoughtNumber);
      }
    }
    this.#activeThoughts.length = startIndex;
    this.#activeThoughtNumbers.length = startIndex;
    this.#recomputeActiveMaxTotalThoughts();
    return { supersedes, supersedesTotal };
  }

  getActiveThoughts(): readonly StoredThought[] {
    return this.#activeThoughts;
  }

  getActiveThoughtNumbers(max?: number): number[] {
    if (max === undefined) {
      return this.#activeThoughtNumbers.slice();
    }
    if (max <= 0) return [];
    if (this.#activeThoughtNumbers.length <= max) {
      return this.#activeThoughtNumbers.slice();
    }
    return this.#activeThoughtNumbers.slice(-max);
  }

  getThoughtByNumber(thoughtNumber: number): StoredThought | undefined {
    return this.#thoughtIndex.get(thoughtNumber);
  }

  getTotalLength(): number {
    return this.#thoughts.length - this.#headIndex;
  }

  pruneHistoryIfNeeded(): void {
    const excess = this.getTotalLength() - this.#maxThoughts;
    if (excess > 0) {
      const batch = Math.max(excess, Math.ceil(this.#maxThoughts * 0.1));
      this.#removeOldest(batch);
    }

    if (
      this.#estimatedBytes > this.#maxMemoryBytes &&
      this.getTotalLength() > 10
    ) {
      const toRemove = Math.ceil(this.getTotalLength() * 0.2);
      this.#removeOldest(toRemove, { forceCompact: true });
    }
  }

  #estimateThoughtBytes(thought: StoredThought): number {
    return thought.byteLength + this.#estimatedThoughtOverheadBytes;
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
    this.#recomputeActiveMaxTotalThoughts();
  }

  #removeOldest(count: number, options: { forceCompact?: boolean } = {}): void {
    const totalLength = this.getTotalLength();
    if (count <= 0 || totalLength === 0) return;

    const actual = Math.min(count, totalLength);
    const start = this.#headIndex;
    const end = start + actual;

    const removedMaxThoughtNumber = this.#evictRange(start, end);

    this.#headIndex = end;
    if (this.getTotalLength() === 0) {
      this.#resetThoughts();
      return;
    }
    if (removedMaxThoughtNumber >= 0) {
      this.#dropActiveThoughtsUpTo(removedMaxThoughtNumber);
    }

    this.#compactIfNeeded(options.forceCompact);
  }

  #evictRange(start: number, end: number): number {
    let removedBytes = 0;
    let maxThoughtNumber = -1;

    for (let index = start; index < end; index += 1) {
      const thought = this.#thoughts[index];
      if (!thought) continue;

      removedBytes += this.#estimateThoughtBytes(thought);
      this.#thoughtIndex.delete(thought.thoughtNumber);
      maxThoughtNumber = thought.thoughtNumber;
    }

    this.#estimatedBytes -= removedBytes;
    return maxThoughtNumber;
  }

  #compactIfNeeded(force = false): void {
    if (this.#headIndex === 0) return;
    if (this.getTotalLength() === 0) {
      this.#resetThoughts();
      return;
    }
    if (!force && !this.#shouldCompact()) {
      return;
    }

    this.#thoughts = this.#thoughts.slice(this.#headIndex);
    this.#headIndex = 0;
  }

  #shouldCompact(): boolean {
    return (
      this.#headIndex >= COMPACT_THRESHOLD ||
      this.#headIndex >= this.#thoughts.length * COMPACT_RATIO
    );
  }

  #resetThoughts(): void {
    this.#thoughts = [];
    this.#thoughtIndex.clear();
    this.#activeThoughts = [];
    this.#activeThoughtNumbers = [];
    this.#activeMaxTotalThoughts = 0;
    this.#headIndex = 0;
    this.#nextThoughtNumber = 1;
    this.#estimatedBytes = 0;
  }
}
