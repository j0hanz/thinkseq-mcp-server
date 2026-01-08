import { z } from 'zod';

export const ThinkSeqInputSchema = z.strictObject({
  thought: z.string().min(1).max(50000).describe('Your current thinking step'),
  thoughtNumber: z
    .number()
    .int()
    .min(1)
    .max(10000)
    .describe('Current thought number in sequence'),
  totalThoughts: z
    .number()
    .int()
    .min(1)
    .max(10000)
    .describe('Estimated total thoughts needed (can adjust)'),
  nextThoughtNeeded: z
    .boolean()
    .describe('Whether another thought step is needed'),
});
