import type { StoredThought } from '../lib/types.js';

export function collectRemovedBytes(
  thoughts: StoredThought[],
  start: number,
  end: number,
  estimateThoughtBytes: (thought: StoredThought) => number
): number {
  let removedBytes = 0;

  for (let index = start; index < end; index += 1) {
    const thought = thoughts[index];
    if (!thought) continue;
    removedBytes += estimateThoughtBytes(thought);
  }

  return removedBytes;
}
