import type {
  ProcessResult,
  StoredThought,
  ThoughtData,
} from '../lib/types.js';
import { findThoughtByNumber } from './thoughtQueries.js';

export function resolveRevisionTarget(
  input: ThoughtData,
  thoughts: StoredThought[],
  headIndex: number
): { ok: true; targetNumber: number } | { ok: false; error: ProcessResult } {
  const targetNumberResult = getRevisionTargetNumber(input);
  if (!targetNumberResult.ok) {
    return targetNumberResult;
  }

  const validationError = validateRevisionTarget(
    thoughts,
    headIndex,
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
  thoughts: StoredThought[],
  headIndex: number,
  targetNumber: number
): ProcessResult | undefined {
  const target = findThoughtByNumber(thoughts, headIndex, targetNumber);
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
