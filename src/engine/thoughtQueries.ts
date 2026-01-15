import type {
  ContextSummary,
  RevisionInfo,
  StoredThought,
} from '../lib/types.js';

export function buildContextSummary(
  activeThoughts: readonly StoredThought[],
  revisionInfo?: RevisionInfo
): ContextSummary {
  let recent: StoredThought[];
  let stepIndexes: number[];

  if (activeThoughts.length > 5) {
    const anchor = activeThoughts[0];
    if (!anchor) throw new Error('Invariant violation: anchor thought missing');
    const tail = activeThoughts.slice(-4);
    recent = [anchor, ...tail];
    stepIndexes = [
      1,
      ...tail.map((_, index) => activeThoughts.length - 4 + index + 1),
    ];
  } else {
    recent = activeThoughts.slice();
    stepIndexes = recent.map((_, index) => index + 1);
  }

  const recentThoughts = recent.map((thought, index) => ({
    stepIndex: stepIndexes[index] ?? index + 1,
    number: thought.thoughtNumber,
    preview:
      thought.thought.length > 100
        ? `${thought.thought.slice(0, 100)}...`
        : thought.thought,
  }));

  if (revisionInfo !== undefined) {
    return { recentThoughts, revisionInfo };
  }
  return { recentThoughts };
}
