import type {
  ProcessResult,
  StoredThought,
  ThoughtData,
} from '../lib/types.js';

export type RevisionTargetResolution =
  | { ok: true; targetNumber: number; target: StoredThought }
  | { ok: false; result: ProcessResult };

function missingRevisionError(): RevisionTargetResolution {
  return {
    ok: false,
    result: buildRevisionError(
      'E_REVISION_MISSING',
      'revisesThought is required for revision'
    ),
  };
}

function targetNotFoundError(targetNumber: number): RevisionTargetResolution {
  return {
    ok: false,
    result: buildRevisionError(
      'E_REVISION_TARGET_NOT_FOUND',
      `Thought ${targetNumber} not found`
    ),
  };
}

function targetSupersededError(targetNumber: number): RevisionTargetResolution {
  return {
    ok: false,
    result: buildRevisionError(
      'E_REVISION_TARGET_SUPERSEDED',
      `Thought ${targetNumber} was already superseded`
    ),
  };
}

export function resolveRevisionTarget(
  input: ThoughtData,
  getThoughtByNumber: (thoughtNumber: number) => StoredThought | undefined
): RevisionTargetResolution {
  const targetNumber = input.revisesThought;
  if (targetNumber === undefined) return missingRevisionError();

  const target = getThoughtByNumber(targetNumber);
  if (!target) return targetNotFoundError(targetNumber);
  if (!target.isActive) return targetSupersededError(targetNumber);

  return { ok: true, targetNumber, target };
}

function buildRevisionError(code: string, message: string): ProcessResult {
  return {
    ok: false,
    error: { code, message },
  };
}
