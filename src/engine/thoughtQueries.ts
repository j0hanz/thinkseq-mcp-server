import type {
  ContextSummary,
  RevisionInfo,
  StoredThought,
} from '../lib/types.js';

function selectRecentThoughts(activeThoughts: readonly StoredThought[]): {
  recent: StoredThought[];
  stepIndexes: number[];
} {
  const len = activeThoughts.length;
  const recent: StoredThought[] = [];
  const stepIndexes: number[] = [];

  if (len > 5) {
    const anchor = activeThoughts[0];
    if (!anchor) throw new Error('Invariant violation: anchor thought missing');
    recent.push(anchor);
    stepIndexes.push(1);
  }

  const start = len <= 5 ? 0 : len - 4;
  for (let i = start; i < len; i += 1) {
    const thought = activeThoughts[i];
    if (thought) {
      recent.push(thought);
      stepIndexes.push(i + 1);
    }
  }
  return { recent, stepIndexes };
}

function formatThoughtPreview(thought: string): string {
  if (thought.length <= 100) return thought;
  return `${thought.slice(0, 100)}...`;
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
