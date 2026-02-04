import type {
  ContextSummary,
  RevisionInfo,
  StoredThought,
} from '../lib/types.js';

const MAX_PREVIEW_CHARS = 100;
const MAX_RECENT_THOUGHTS = 5;
const RECENT_TAIL_COUNT = 4;

interface RecentSelection {
  recent: StoredThought[];
  stepIndexes: number[];
}

function selectRecentThoughts(
  activeThoughts: readonly StoredThought[]
): RecentSelection {
  const len = activeThoughts.length;

  const recent: StoredThought[] = [];
  const stepIndexes: number[] = [];

  // If we have lots of thoughts, keep the first as an anchor.
  if (len > MAX_RECENT_THOUGHTS) {
    const anchor = activeThoughts[0];
    if (!anchor) throw new Error('Invariant violation: anchor thought missing');
    recent.push(anchor);
    stepIndexes.push(1);
  }

  const startIndex =
    len <= MAX_RECENT_THOUGHTS ? 0 : Math.max(0, len - RECENT_TAIL_COUNT);

  for (let i = startIndex; i < len; i += 1) {
    const thought = activeThoughts[i];
    if (!thought) continue;

    recent.push(thought);
    stepIndexes.push(i + 1);
  }

  return { recent, stepIndexes };
}

function truncatePreview(input: string, maxChars: number): string {
  // Preserve codepoint boundaries (emoji-safe) without depending on Intl.Segmenter.
  const iterator = input[Symbol.iterator]();
  const preview: string[] = [];

  for (let i = 0; i < maxChars; i += 1) {
    const next = iterator.next();
    if (next.done) return input;
    preview.push(next.value);
  }

  const extra = iterator.next();
  if (extra.done) return input;
  return `${preview.join('')}...`;
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

  return revisionInfo ? { recentThoughts, revisionInfo } : { recentThoughts };
}
