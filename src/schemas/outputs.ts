import { z } from 'zod';

import { MAX_REVISABLE_THOUGHTS, MAX_SUPERSEDES } from '../engineConfig.js';

const ThinkSeqResultSchema = z.strictObject({
  thoughtNumber: z.number(),
  totalThoughts: z.number(),
  progress: z.number().min(0).max(1),
  isComplete: z.boolean().describe('True when thoughtNumber >= totalThoughts'),
  thoughtHistoryLength: z.number(),
  hasRevisions: z.boolean().describe('True if any thought has been revised'),
  activePathLength: z
    .number()
    .describe('Count of non-superseded thoughts in active chain'),
  revisableThoughts: z
    .array(z.number())
    .max(MAX_REVISABLE_THOUGHTS)
    .describe('Thought numbers available for revision'),
  revisableThoughtsTotal: z.number(),
  context: z.strictObject({
    recentThoughts: z
      .array(
        z.strictObject({
          stepIndex: z
            .number()
            .int()
            .min(1)
            .describe('1-based index in the current active chain'),
          number: z.number(),
          preview: z.string(),
        })
      )
      .max(5),
    revisionInfo: z
      .strictObject({
        revises: z.number(),
        supersedes: z.array(z.number()).max(MAX_SUPERSEDES),
        supersedesTotal: z.number(),
      })
      .optional(),
  }),
});

const ThinkSeqErrorSchema = z.strictObject({
  code: z.string(),
  message: z.string(),
});

export const ThinkSeqOutputSchema = z
  .strictObject({
    ok: z.boolean(),
    result: ThinkSeqResultSchema.optional(),
    error: ThinkSeqErrorSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.ok) {
      if (value.result === undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['result'],
          message: 'result is required when ok is true',
        });
      }
      if (value.error !== undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['error'],
          message: 'error must be omitted when ok is true',
        });
      }
      return;
    }

    if (value.error === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['error'],
        message: 'error is required when ok is false',
      });
    }
  });
