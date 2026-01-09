import type {
  ProcessResult,
  StoredThought,
  ThoughtData,
} from '../lib/types.js';

export function resolveRevisionTarget(
  input: ThoughtData,
  getThoughtByNumber: (thoughtNumber: number) => StoredThought | undefined
): { ok: true; targetNumber: number } | { ok: false; error: ProcessResult } {
  const targetNumberResult = getRevisionTargetNumber(input);
  if (!targetNumberResult.ok) {
    return targetNumberResult;
  }

  const validationError = validateRevisionTarget(
    getThoughtByNumber,
    targetNumberResult.targetNumber
  );

  if (validationError) {
    return { ok: false, error: validationError };
  }

  return { ok: true, targetNumber: targetNumberResult.targetNumber };
}

function getRevisionTargetNumber(
  input: ThoughtData
): { ok: true; targetNumber: number } | { ok: false; error: ProcessResult } {
  const targetNumber = input.revisesThought;
  if (targetNumber !== undefined) {
    return { ok: true, targetNumber };
  }

  return {
    ok: false,
    error: buildRevisionError(
      'E_REVISION_MISSING',
      'revisesThought is required for revision'
    ),
  };
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
