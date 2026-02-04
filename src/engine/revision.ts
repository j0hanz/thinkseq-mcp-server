import type {
  ProcessResult,
  StoredThought,
  ThoughtData,
} from '../lib/types.js';

type RevisionErrorCode =
  | 'E_REVISION_MISSING'
  | 'E_REVISION_TARGET_NOT_FOUND'
  | 'E_REVISION_TARGET_SUPERSEDED';

export type RevisionTargetResolution =
  | { ok: true; targetNumber: number; target: StoredThought }
  | { ok: false; result: ProcessResult };

export function resolveRevisionTarget(
  input: ThoughtData,
  getThoughtByNumber: (thoughtNumber: number) => StoredThought | undefined
): RevisionTargetResolution {
  const targetNumber = input.revisesThought;
  if (targetNumber === undefined) {
    return error(
      'E_REVISION_MISSING',
      'revisesThought is required for revision'
    );
  }

  const target = getThoughtByNumber(targetNumber);
  if (!target) {
    return error(
      'E_REVISION_TARGET_NOT_FOUND',
      `Thought ${targetNumber} not found`
    );
  }

  if (!target.isActive) {
    return error(
      'E_REVISION_TARGET_SUPERSEDED',
      `Thought ${targetNumber} was already superseded`
    );
  }

  return { ok: true, targetNumber, target };
}

function error(
  code: RevisionErrorCode,
  message: string
): RevisionTargetResolution {
  return {
    ok: false,
    result: {
      ok: false,
      error: { code, message },
    },
  };
}
