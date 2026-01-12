import { z } from 'zod';

import { MAX_REVISABLE_THOUGHTS, MAX_SUPERSEDES } from '../engineConfig.js';

const ThinkSeqResultSchema = z.object({
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
  context: z.object({
    recentThoughts: z
      .array(
        z.object({
          number: z.number(),
          preview: z.string(),
        })
      )
      .max(5),
    revisionInfo: z
      .object({
        revises: z.number(),
        supersedes: z.array(z.number()).max(MAX_SUPERSEDES),
        supersedesTotal: z.number(),
      })
      .optional(),
  }),
});

const ThinkSeqErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
});

export const ThinkSeqOutputSchema = z.discriminatedUnion('ok', [
  z.strictObject({
    ok: z.literal(true),
    result: ThinkSeqResultSchema,
  }),
  z.strictObject({
    ok: z.literal(false),
    error: ThinkSeqErrorSchema,
    result: z.unknown().optional(),
  }),
]);
