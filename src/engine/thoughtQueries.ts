import type {
  ContextSummary,
  RevisionInfo,
  StoredThought,
} from '../lib/types.js';

function getRecentActiveThoughts(
  activeThoughts: readonly StoredThought[],
  limit: number
): StoredThought[] {
  if (limit <= 0) return [];
  return activeThoughts.slice(-limit);
}

export function buildContextSummary(
  activeThoughts: readonly StoredThought[],
  revisionInfo?: RevisionInfo
): ContextSummary {
  const recent = getRecentActiveThoughts(activeThoughts, 5);
  const recentThoughts = recent.map((thought) => ({
    number: thought.thoughtNumber,
    preview:
      thought.thought.slice(0, 100) +
      (thought.thought.length > 100 ? '...' : ''),
  }));

  if (revisionInfo !== undefined) {
    return { recentThoughts, revisionInfo };
  }
  return { recentThoughts };
}
