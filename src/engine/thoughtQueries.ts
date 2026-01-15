import type {
  ContextSummary,
  RevisionInfo,
  StoredThought,
} from '../lib/types.js';

function selectRecentThoughts(
  activeThoughts: readonly StoredThought[]
): { recent: StoredThought[]; stepIndexes: number[] } {
  if (activeThoughts.length <= 5) {
    const recent = activeThoughts.slice();
    const stepIndexes = recent.map((_, index) => index + 1);
    return { recent, stepIndexes };
  }

  const anchor = activeThoughts[0];
  if (!anchor) throw new Error('Invariant violation: anchor thought missing');
  const tail = activeThoughts.slice(-4);
  const recent = [anchor, ...tail];
  const stepIndexes = [
    1,
    ...tail.map((_, index) => activeThoughts.length - 4 + index + 1),
  ];
  return { recent, stepIndexes };
}

function formatThoughtPreview(thought: string): string {
  return thought.length > 100 ? `${thought.slice(0, 100)}...` : thought;
}

export function buildContextSummary(
  activeThoughts: readonly StoredThought[],
  revisionInfo?: RevisionInfo
): ContextSummary {
  const { recent, stepIndexes } = selectRecentThoughts(activeThoughts);

  const recentThoughts = recent.map((thought, index) => ({
    stepIndex: stepIndexes[index] ?? index + 1,
    number: thought.thoughtNumber,
    preview: formatThoughtPreview(thought.thought),
  }));

  if (revisionInfo !== undefined) {
    return { recentThoughts, revisionInfo };
  }
  return { recentThoughts };
}
