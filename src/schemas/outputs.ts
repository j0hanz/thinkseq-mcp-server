import { z } from 'zod';

const ContextSchema = z.strictObject({
  recentThoughts: z
    .array(
      z.strictObject({
        number: z.number(),
        preview: z.string(),
      })
    )
    .max(5),
});

const ResultSchema = z.strictObject({
  thoughtNumber: z.number(),
  totalThoughts: z.number(),
  progress: z.number().min(0).max(1),
  nextThoughtNeeded: z.boolean(),
  thoughtHistoryLength: z.number(),
  context: ContextSchema,
});

const ErrorSchema = z.strictObject({
  code: z.string(),
  message: z.string(),
});

const SuccessSchema = z.strictObject({
  ok: z.literal(true),
  result: ResultSchema,
});

const FailureSchema = z.strictObject({
  ok: z.literal(false),
  error: ErrorSchema,
});

export const ThinkSeqOutputSchema = z.discriminatedUnion('ok', [
  SuccessSchema,
  FailureSchema,
]);
