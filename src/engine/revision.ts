import type {
  ProcessResult,
  StoredThought,
  ThoughtData,
} from '../lib/types.js';

export function resolveRevisionTarget(
  input: ThoughtData,
  getThoughtByNumber: (thoughtNumber: number) => StoredThought | undefined
): { ok: true; targetNumber: number } | { ok: false; error: ProcessResult } {
  const targetNumber = input.revisesThought;
  if (targetNumber === undefined) {
    return {
      ok: false,
      error: buildRevisionError(
        'E_REVISION_MISSING',
        'revisesThought is required for revision'
      ),
    };
  }

  const validationError = validateRevisionTarget(
    getThoughtByNumber,
    targetNumber
  );

  if (validationError) {
    return { ok: false, error: validationError };
  }

  return { ok: true, targetNumber };
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
