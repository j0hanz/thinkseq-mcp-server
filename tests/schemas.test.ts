import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ThinkSeqInputSchema } from '../src/schemas/inputs.js';
import { ThinkSeqOutputSchema } from '../src/schemas/outputs.js';

const VALID_RESULT = {
  thoughtNumber: 1,
  totalThoughts: 2,
  progress: 0.5,
  isComplete: false,
  thoughtHistoryLength: 1,
  hasRevisions: false,
  activePathLength: 1,
  revisableThoughts: [1],
  revisableThoughtsTotal: 1,
  context: {
    recentThoughts: [],
  },
} as const;

const VALID_OUTPUT = {
  ok: true,
  result: VALID_RESULT,
} as const;

void describe('ThinkSeqInputSchema', () => {
  void it('accepts valid input with totalThoughts', () => {
    const input = {
      thought: 'step',
      totalThoughts: 2,
    };

    const result = ThinkSeqInputSchema.safeParse(input);
    assert.equal(result.success, true);
  });

  void it('accepts valid input without totalThoughts (default)', () => {
    const input = {
      thought: 'step',
    };

    const result = ThinkSeqInputSchema.safeParse(input);
    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.data.totalThoughts, undefined);
    }
  });

  void it('strips unknown keys', () => {
    const input = {
      thought: 'step',
      totalThoughts: 2,
      extra: 'nope',
    };

    const result = ThinkSeqInputSchema.safeParse(input);
    assert.equal(result.success, true);
    if (result.success) {
      assert.ok(!('extra' in result.data));
    }
  });

  void it('exports a Zod schema for MCP SDK', () => {
    assert.equal(typeof ThinkSeqInputSchema.safeParse, 'function');
  });
});

void describe('ThinkSeqOutputSchema', () => {
  void it('accepts valid output shape', () => {
    const result = ThinkSeqOutputSchema.safeParse(VALID_OUTPUT);
    assert.equal(result.success, true);
  });

  void it('rejects missing fields', () => {
    const result = ThinkSeqOutputSchema.safeParse({ ok: true });
    assert.equal(result.success, false);
  });

  void it('rejects invalid progress range', () => {
    const result = ThinkSeqOutputSchema.safeParse({
      ok: true,
      result: {
        ...VALID_RESULT,
        progress: 1.5,
      },
    });
    assert.equal(result.success, false);
  });

  void it('exports a Zod schema for MCP SDK', () => {
    assert.equal(typeof ThinkSeqOutputSchema.safeParse, 'function');
  });
});
