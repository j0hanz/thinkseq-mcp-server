import type {
  ContextSummary,
  RevisionInfo,
  StoredThought,
} from '../lib/types.js';

export function buildContextSummary(
  activeThoughts: readonly StoredThought[],
  revisionInfo?: RevisionInfo
): ContextSummary {
  const recent = activeThoughts.slice(-5);
  const startIndex = activeThoughts.length - recent.length;
  const recentThoughts = recent.map((thought, index) => ({
    stepIndex: startIndex + index + 1,
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
