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
    return {
      thoughtNumber,
      totalThoughts: Math.max(totalThoughts, thoughtNumber),
    };
  }

  storeThought(stored: StoredThought): void {
    this.#thoughts.push(stored);
    this.#thoughtIndex.set(stored.thoughtNumber, stored);
    if (stored.isActive) {
      this.#activeThoughts.push(stored);
      this.#activeThoughtNumbers.push(stored.thoughtNumber);
    }
    this.#estimatedBytes += this.#estimateThoughtBytes(stored);
  }

  #findActiveThoughtIndex(thoughtNumber: number): number {
    const activeThoughtNumbers = this.#activeThoughtNumbers;
    let low = 0;
    let high = activeThoughtNumbers.length;
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
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
    const foundValue = activeThoughtNumbers[low];
    if (foundValue === thoughtNumber) return low;
    return -1;
  }

  supersedeFrom(targetNumber: number, supersededBy: number): number[] {
    const startIndex = this.#findActiveThoughtIndex(targetNumber);
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

  getActiveThoughts(): readonly StoredThought[] {
    return this.#activeThoughts;
  }

  getActiveThoughtNumbers(): readonly number[] {
    return this.#activeThoughtNumbers;
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
    const totalLength = this.getTotalLength();
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
    if (this.getTotalLength() === 0) {
      this.#resetThoughts();
      return;
    }
    if (removedMaxThoughtNumber >= 0) {
      this.#dropActiveThoughtsUpTo(removedMaxThoughtNumber);
    }
    this.#compactIfNeeded(forceCompact);
  }

  #compactIfNeeded(force = false): void {
    if (this.#headIndex === 0) return;
    const totalLength = this.getTotalLength();
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
    this.#headIndex = 0;
    this.#nextThoughtNumber = 1;
    this.#estimatedBytes = 0;
  }
}
