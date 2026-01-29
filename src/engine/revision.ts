import type {
  ProcessResult,
  StoredThought,
  ThoughtData,
} from '../lib/types.js';

export type RevisionTargetResolution =
  | { ok: true; targetNumber: number; target: StoredThought }
  | { ok: false; result: ProcessResult };

export function resolveRevisionTarget(
  input: ThoughtData,
  getThoughtByNumber: (thoughtNumber: number) => StoredThought | undefined
): RevisionTargetResolution {
  const targetNumber = input.revisesThought;
  if (targetNumber === undefined) {
    return {
      ok: false,
      result: buildRevisionError(
        'E_REVISION_MISSING',
        'revisesThought is required for revision'
      ),
    };
  }

  const result = validateRevisionTarget(getThoughtByNumber, targetNumber);

  if (result) {
    return { ok: false, result };
  }

  const target = getThoughtByNumber(targetNumber);
  if (!target) {
    return {
      ok: false,
      result: buildRevisionError(
        'E_REVISION_TARGET_NOT_FOUND',
        `Thought ${targetNumber} not found`
      ),
    };
  }
  return { ok: true, targetNumber, target };
}

function validateRevisionTarget(
  getThoughtByNumber: (thoughtNumber: number) => StoredThought | undefined,
  targetNumber: number
): ProcessResult | undefined {
  const target = getThoughtByNumber(targetNumber);
  if (!target) {
    return buildRevisionError(
      'E_REVISION_TARGET_NOT_FOUND',
      `Thought ${targetNumber} not found`
    );
  }

  if (!target.isActive) {
    return buildRevisionError(
      'E_REVISION_TARGET_SUPERSEDED',
      `Thought ${targetNumber} was already superseded`
    );
  }

  return undefined;
}

function buildRevisionError(code: string, message: string): ProcessResult {
  return {
    ok: false,
    error: { code, message },
  };
}
