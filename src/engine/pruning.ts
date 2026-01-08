import type { StoredThought } from '../lib/types.js';

export interface RemovalStats {
  branchRemovals: Map<string, number>;
  removedBytes: number;
  removedRevisions: number;
}

export function collectRemovalStats(
  thoughts: StoredThought[],
  start: number,
  end: number,
  estimateThoughtBytes: (thought: StoredThought) => number
): RemovalStats {
  const branchRemovals = new Map<string, number>();
  let removedBytes = 0;
  let removedRevisions = 0;

  for (let index = start; index < end; index += 1) {
    const thought = thoughts[index];
    if (!thought) continue;
    removedBytes += estimateThoughtBytes(thought);
    if (thought.isRevision) removedRevisions += 1;
    if (!thought.branchId) continue;
    branchRemovals.set(
      thought.branchId,
      (branchRemovals.get(thought.branchId) ?? 0) + 1
    );
  }

  return { branchRemovals, removedBytes, removedRevisions };
}
