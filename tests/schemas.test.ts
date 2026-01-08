import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { z } from 'zod';

import {
  ThinkSeqInputSchema,
  ThinkSeqInputValidator,
} from '../src/schemas/inputs.js';
import { ThinkSeqOutputSchema } from '../src/schemas/outputs.js';

// Create a validator from output schema shape for testing
const OutputValidator = z.object(ThinkSeqOutputSchema);

const VALID_OUTPUT = {
  thoughtNumber: 1,
  totalThoughts: 2,
  progress: 0.5,
  isComplete: false,
  thoughtHistoryLength: 1,
  hasRevisions: false,
  activePathLength: 1,
  revisableThoughts: [1],
  context: {
    recentThoughts: [],
  },
} as const;

void describe('ThinkSeqInputSchema', () => {
  void it('accepts valid input with totalThoughts', () => {
    const input = {
      thought: 'step',
      totalThoughts: 2,
    };

    const result = ThinkSeqInputValidator.safeParse(input);
    assert.equal(result.success, true);
  });

  void it('accepts valid input without totalThoughts (default)', () => {
    const input = {
      thought: 'step',
    };

    const result = ThinkSeqInputValidator.safeParse(input);
    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.data.totalThoughts, 3);
    }
  });

  void it('rejects unknown keys', () => {
    const input = {
      thought: 'step',
      totalThoughts: 2,
      extra: 'nope',
    };

    const result = ThinkSeqInputValidator.safeParse(input);
    assert.equal(result.success, false);
  });

  void it('exports raw shape for MCP SDK', () => {
    // Verify the exported schema is a raw shape (object with Zod types)
    assert.ok(ThinkSeqInputSchema.thought);
    assert.ok(ThinkSeqInputSchema.totalThoughts);
    assert.ok(ThinkSeqInputSchema.thought._def);
    assert.ok(ThinkSeqInputSchema.totalThoughts._def);
  });
});

void describe('ThinkSeqOutputSchema', () => {
  void it('accepts valid output shape', () => {
    const result = OutputValidator.safeParse(VALID_OUTPUT);
    assert.equal(result.success, true);
  });

  void it('rejects missing fields', () => {
    const result = OutputValidator.safeParse({ thoughtNumber: 1 });
    assert.equal(result.success, false);
  });

  void it('rejects invalid progress range', () => {
    const result = OutputValidator.safeParse({
      ...VALID_OUTPUT,
      progress: 1.5,
    });
    assert.equal(result.success, false);
  });

  void it('exports raw shape for MCP SDK', () => {
    // Verify the exported schema is a raw shape (object with Zod types)
    assert.ok(ThinkSeqOutputSchema.thoughtNumber);
    assert.ok(ThinkSeqOutputSchema.totalThoughts);
    assert.ok(ThinkSeqOutputSchema.progress);
    assert.ok(ThinkSeqOutputSchema.isComplete);
    assert.ok(ThinkSeqOutputSchema.thoughtHistoryLength);
    assert.ok(ThinkSeqOutputSchema.hasRevisions);
    assert.ok(ThinkSeqOutputSchema.activePathLength);
    assert.ok(ThinkSeqOutputSchema.revisableThoughts);
    assert.ok(ThinkSeqOutputSchema.context);
  });
});
