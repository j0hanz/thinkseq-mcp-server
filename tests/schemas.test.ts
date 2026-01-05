import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ThinkSeqInputSchema } from '../src/schemas/inputs.js';
import { ThinkSeqOutputSchema } from '../src/schemas/outputs.js';

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

void describe('ThinkSeqOutputSchema', () => {
  void it('accepts output shape', () => {
    const output = {
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
    };

    const result = ThinkSeqOutputSchema.safeParse(output);
    assert.equal(result.success, true);
  });
});
