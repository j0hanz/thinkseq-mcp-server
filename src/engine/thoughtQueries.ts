import type {
  ContextSummary,
  RevisionInfo,
  StoredThought,
} from '../lib/types.js';

const MAX_PREVIEW_CHARS = 100;
const MAX_RECENT_THOUGHTS = 5;
const RECENT_TAIL_COUNT = 4;

function selectRecentThoughts(activeThoughts: readonly StoredThought[]): {
  recent: StoredThought[];
  stepIndexes: number[];
} {
  const len = activeThoughts.length;
  const recent: StoredThought[] = [];
  const stepIndexes: number[] = [];

  if (len > MAX_RECENT_THOUGHTS) {
    const anchor = activeThoughts[0];
    if (!anchor) throw new Error('Invariant violation: anchor thought missing');
    recent.push(anchor);
    stepIndexes.push(1);
  }

  const start =
    len <= MAX_RECENT_THOUGHTS ? 0 : Math.max(0, len - RECENT_TAIL_COUNT);
  for (let i = start; i < len; i += 1) {
    const thought = activeThoughts[i];
    if (thought) {
      recent.push(thought);
      stepIndexes.push(i + 1);
    }
  }
  return { recent, stepIndexes };
}

function truncatePreview(input: string, maxChars: number): string {
  const codepoints = Array.from(input);
  if (codepoints.length <= maxChars) return input;
  return `${codepoints.slice(0, maxChars).join('')}...`;
}

export function buildContextSummary(
  activeThoughts: readonly StoredThought[],
  revisionInfo?: RevisionInfo
): ContextSummary {
  const { recent, stepIndexes } = selectRecentThoughts(activeThoughts);

  const recentThoughts = recent.map((thought, index) => ({
    stepIndex: stepIndexes[index] ?? index + 1,
    number: thought.thoughtNumber,
    preview: truncatePreview(thought.thought, MAX_PREVIEW_CHARS),
  }));

  if (revisionInfo !== undefined) {
    return { recentThoughts, revisionInfo };
  }
  return { recentThoughts };
}
