import { z } from 'zod';

export const ThinkSeqOutputSchema = z.strictObject({
  ok: z.boolean(),
  result: z
    .strictObject({
      thoughtNumber: z.number(),
      totalThoughts: z.number(),
      nextThoughtNeeded: z.boolean(),
      thoughtHistoryLength: z.number(),
      branches: z.array(z.string()),
      context: z.strictObject({
        recentThoughts: z
          .array(
            z.strictObject({
              number: z.number(),
              preview: z.string(),
              type: z
                .enum([
                  'analysis',
                  'hypothesis',
                  'verification',
                  'revision',
                  'conclusion',
                ])
                .optional(),
            })
          )
          .max(5),
        currentBranch: z.string().optional(),
        hasRevisions: z.boolean(),
      }),
    })
    .optional(),
  error: z
    .strictObject({
      code: z.string(),
      message: z.string(),
    })
    .optional(),
});
