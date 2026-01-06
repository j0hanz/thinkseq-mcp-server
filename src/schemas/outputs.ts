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

const BaseOutputSchema = z.strictObject({
  ok: z.boolean(),
  result: ResultSchema.optional(),
  error: ErrorSchema.optional(),
});

type ThinkSeqOutputValue = z.infer<typeof BaseOutputSchema>;

function addSuccessIssues(
  value: ThinkSeqOutputValue,
  ctx: z.RefinementCtx
): void {
  if (value.result === undefined) {
    ctx.addIssue({
      code: 'custom',
      message: 'result is required when ok is true',
      path: ['result'],
    });
  }
  if (value.error !== undefined) {
    ctx.addIssue({
      code: 'custom',
      message: 'error must be omitted when ok is true',
      path: ['error'],
    });
  }
}

function addFailureIssues(
  value: ThinkSeqOutputValue,
  ctx: z.RefinementCtx
): void {
  if (value.error === undefined) {
    ctx.addIssue({
      code: 'custom',
      message: 'error is required when ok is false',
      path: ['error'],
    });
  }
  if (value.result !== undefined) {
    ctx.addIssue({
      code: 'custom',
      message: 'result must be omitted when ok is false',
      path: ['result'],
    });
  }
}

export const ThinkSeqOutputSchema = BaseOutputSchema.superRefine(
  (value, ctx) => {
    if (value.ok) {
      addSuccessIssues(value, ctx);
    } else {
      addFailureIssues(value, ctx);
    }
  }
);
