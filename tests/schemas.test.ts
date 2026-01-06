import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ThinkSeqInputSchema } from '../src/schemas/inputs.js';
import { ThinkSeqOutputSchema } from '../src/schemas/outputs.js';

const OK_TRUE_OUTPUT = {
  ok: true,
  result: {
    thoughtNumber: 1,
    totalThoughts: 2,
    nextThoughtNeeded: true,
    thoughtHistoryLength: 1,
    branches: [],
    context: {
      recentThoughts: [],
      hasRevisions: false,
    },
  },
} as const;

const OK_FALSE_OUTPUT = {
  ok: false,
  error: {
    code: 'E_THINK',
    message: 'boom',
  },
} as const;

const OK_TRUE_MISSING_RESULT_OUTPUT = {
  ok: true,
} as const;

const OK_TRUE_WITH_BOTH_OUTPUT = {
  ok: true,
  result: {
    thoughtNumber: 1,
    totalThoughts: 1,
    nextThoughtNeeded: false,
    thoughtHistoryLength: 1,
    branches: [],
    context: {
      recentThoughts: [],
      hasRevisions: false,
    },
  },
  error: {
    code: 'E_THINK',
    message: 'should not be present',
  },
} as const;

void describe('ThinkSeqInputSchema', () => {
  void it('accepts valid input', () => {
    const input = {
      thought: 'step',
      thoughtNumber: 1,
      totalThoughts: 2,
      nextThoughtNeeded: true,
    };

    const result = ThinkSeqInputSchema.safeParse(input);
    assert.equal(result.success, true);
  });

  void it('rejects unknown keys', () => {
    const input = {
      thought: 'step',
      thoughtNumber: 1,
      totalThoughts: 2,
      nextThoughtNeeded: true,
      extra: 'nope',
    };

    const result = ThinkSeqInputSchema.safeParse(input);
    assert.equal(result.success, false);
  });
});

void describe('ThinkSeqOutputSchema ok:true', () => {
  void it('accepts output shape', () => {
    const result = ThinkSeqOutputSchema.safeParse(OK_TRUE_OUTPUT);
    assert.equal(result.success, true);
  });

  void it('rejects ok:true without result', () => {
    const result = ThinkSeqOutputSchema.safeParse(
      OK_TRUE_MISSING_RESULT_OUTPUT
    );
    assert.equal(result.success, false);
  });

  void it('rejects ok:true with both result and error', () => {
    const result = ThinkSeqOutputSchema.safeParse(OK_TRUE_WITH_BOTH_OUTPUT);
    assert.equal(result.success, false);
  });
});

void describe('ThinkSeqOutputSchema ok:false', () => {
  void it('accepts output shape', () => {
    const result = ThinkSeqOutputSchema.safeParse(OK_FALSE_OUTPUT);
    assert.equal(result.success, true);
  });
});
