import { z } from 'zod';

const ThoughtTypeSchema = z.enum([
  'analysis',
  'hypothesis',
  'verification',
  'revision',
  'conclusion',
]);

const ContextSchema = z.strictObject({
  recentThoughts: z
    .array(
      z.strictObject({
        number: z.number(),
        preview: z.string(),
        type: ThoughtTypeSchema.optional(),
      })
    )
    .max(5),
  currentBranch: z.string().optional(),
  hasRevisions: z.boolean(),
});

const ResultSchema = z.strictObject({
  thoughtNumber: z.number(),
  totalThoughts: z.number(),
  nextThoughtNeeded: z.boolean(),
  thoughtHistoryLength: z.number(),
  branches: z.array(z.string()),
  context: ContextSchema,
});

const ErrorSchema = z.strictObject({
  code: z.string(),
  message: z.string(),
});

export const ThinkSeqOutputSchema = z.discriminatedUnion('ok', [
  z.strictObject({
    ok: z.literal(true),
    result: ResultSchema,
  }),
  z.strictObject({
    ok: z.literal(false),
    error: ErrorSchema,
  }),
]);
