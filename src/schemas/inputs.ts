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
  isRevision: z
    .boolean()
    .optional()
    .describe('Whether this revises previous thinking'),
  revisesThought: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe('Which thought number is being reconsidered'),
  branchFromThought: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe('Branching point thought number'),
  branchId: z.string().max(100).optional().describe('Branch identifier'),
  thoughtType: z
    .enum(['analysis', 'hypothesis', 'verification', 'revision', 'conclusion'])
    .optional()
    .describe('Type of thinking step (helps with context selection)'),
});
