import { z } from 'zod';

export const ThinkSeqInputSchema = z.strictObject({
  thought: z.string().min(1).max(5000).describe('Your current thinking step'),
  totalThoughts: z
    .number()
    .int()
    .min(1)
    .max(25)
    .optional()
    .describe('Estimated total thoughts (1-25, default: 3)'),
  revisesThought: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe(
      'Revise a previous thought by number. The original is preserved for audit.'
    ),
});
