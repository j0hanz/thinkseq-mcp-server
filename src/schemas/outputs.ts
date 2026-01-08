import { z } from 'zod';

export const ThinkSeqOutputSchema = {
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
    .describe('Thought numbers available for revision'),
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
        supersedes: z.array(z.number()),
      })
      .optional(),
  }),
};
