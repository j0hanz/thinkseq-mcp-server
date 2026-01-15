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

  if (activeThoughts.length > 5) {
    const anchor = activeThoughts[0];
    if (!anchor) throw new Error('Invariant violation: anchor thought missing');
    const tail = activeThoughts.slice(-4);
    recent = [anchor, ...tail];
  } else {
    recent = activeThoughts.slice();
  }

  const recentThoughts = recent.map((thought) => ({
    stepIndex: thought.thoughtNumber,
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
