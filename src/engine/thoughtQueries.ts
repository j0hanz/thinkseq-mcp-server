import type {
  ContextSummary,
  RevisionInfo,
  StoredThought,
} from '../lib/types.js';

export function findThoughtByNumber(
  thoughts: StoredThought[],
  headIndex: number,
  num: number
): StoredThought | undefined {
  for (let i = headIndex; i < thoughts.length; i++) {
    const thought = thoughts[i];
    if (thought?.thoughtNumber === num) {
      return thought;
    }
  }
  return undefined;
}

export function collectSupersededChain(
  thoughts: StoredThought[],
  headIndex: number,
  fromNumber: number
): number[] {
  const result: number[] = [];
  for (let i = headIndex; i < thoughts.length; i++) {
    const thought = thoughts[i];
    if (thought && thought.thoughtNumber >= fromNumber && thought.isActive) {
      result.push(thought.thoughtNumber);
    }
  }
  return result;
}

export function getActiveThoughts(
  thoughts: StoredThought[],
  headIndex: number
): StoredThought[] {
  const active: StoredThought[] = [];
  for (let i = headIndex; i < thoughts.length; i++) {
    const thought = thoughts[i];
    if (thought?.isActive) {
      active.push(thought);
    }
  }
  return active;
}

export function getRecentActiveThoughts(
  activeThoughts: StoredThought[],
  limit: number
): StoredThought[] {
  if (limit <= 0) return [];
  return activeThoughts.slice(-limit);
}

export function getRevisableThoughtNumbers(
  activeThoughts: StoredThought[]
): number[] {
  return activeThoughts.map((thought) => thought.thoughtNumber);
}

export function buildContextSummary(
  activeThoughts: StoredThought[],
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
