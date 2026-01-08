import { performance } from 'node:perf_hooks';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { z } from 'zod';

import type { ThinkingEngine } from '../engine.js';
import { runWithContext } from '../lib/context.js';
import { publishToolEvent } from '../lib/diagnostics.js';
import type { ErrorResponse } from '../lib/errors.js';
import { createErrorResponse, getErrorMessage } from '../lib/errors.js';
import type { ProcessResult, ThoughtData } from '../lib/types.js';
import { ThinkSeqInputSchema } from '../schemas/inputs.js';
import { ThinkSeqOutputSchema } from '../schemas/outputs.js';

const THINKSEQ_TOOL_DEFINITION = {
  title: 'Think Sequentially',
  description: `Structured sequential thinking with branching and revision support.

Use for:
- Breaking down complex problems into steps
- Exploring alternative solution paths (branching)
- Revising earlier thinking based on new insights

Key parameters:
- thought: Current thinking step
- thoughtNumber: Step number (starts at 1)
- totalThoughts: Estimated total (adjustable)
- nextThoughtNeeded: false only when done`,
  inputSchema: ThinkSeqInputSchema,
  outputSchema: ThinkSeqOutputSchema,
};

interface ToolRegistrar {
  registerTool: McpServer['registerTool'];
}

interface EngineLike {
  processThought: (
    input: ThoughtData
  ) =>
    | ReturnType<ThinkingEngine['processThought']>
    | Promise<ReturnType<ThinkingEngine['processThought']>>;
}
type ThinkSeqInput = z.input<typeof ThinkSeqInputSchema>;
type ToolResponse =
  | ErrorResponse
  | {
      content: { type: 'text'; text: string }[];
      structuredContent: ProcessResult;
    };

function getContextFields(input: ThinkSeqInput): Partial<ThoughtData> {
  return {
    ...(input.isRevision !== undefined && { isRevision: input.isRevision }),
    ...(input.revisesThought !== undefined && {
      revisesThought: input.revisesThought,
    }),
    ...(input.thoughtType !== undefined && { thoughtType: input.thoughtType }),
  };
}

function getBranchFields(input: ThinkSeqInput): Partial<ThoughtData> {
  return {
    ...(input.branchFromThought !== undefined && {
      branchFromThought: input.branchFromThought,
    }),
    ...(input.branchId !== undefined && { branchId: input.branchId }),
  };
}

function normalizeThoughtInput(input: ThinkSeqInput): ThoughtData {
  return {
    thought: input.thought,
    thoughtNumber: input.thoughtNumber,
    totalThoughts: input.totalThoughts,
    nextThoughtNeeded: input.nextThoughtNeeded,
    ...getContextFields(input),
    ...getBranchFields(input),
  };
}

function publishToolStart(): void {
  publishToolEvent({
    type: 'tool.start',
    tool: 'thinkseq',
    ts: Date.now(),
  });
}

function publishToolSuccess(durationMs: number): void {
  publishToolEvent({
    type: 'tool.end',
    tool: 'thinkseq',
    ts: Date.now(),
    ok: true,
    durationMs,
  });
}

function publishToolFailure(errorMessage: string, durationMs: number): void {
  publishToolEvent({
    type: 'tool.end',
    tool: 'thinkseq',
    ts: Date.now(),
    ok: false,
    errorCode: 'E_THINK',
    errorMessage,
    durationMs,
  });
}

function buildSuccessResponse(result: ProcessResult): ToolResponse {
  return {
    content: [{ type: 'text', text: JSON.stringify(result) }],
    structuredContent: result,
  };
}

function getDurationMs(start: number): number {
  return Math.max(0, performance.now() - start);
}

async function handleThinkSeq(
  engine: EngineLike,
  input: ThinkSeqInput
): Promise<ToolResponse> {
  return runWithContext(async () => {
    const normalized = normalizeThoughtInput(input);
    publishToolStart();
    const start = performance.now();
    try {
      const result = await engine.processThought(normalized);
      const durationMs = getDurationMs(start);
      publishToolSuccess(durationMs);
      return buildSuccessResponse(result);
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      const durationMs = getDurationMs(start);
      publishToolFailure(errorMessage, durationMs);
      return createErrorResponse('E_THINK', errorMessage);
    }
  });
}

export function registerThinkSeq(
  server: ToolRegistrar,
  engine: EngineLike
): void {
  server.registerTool('thinkseq', THINKSEQ_TOOL_DEFINITION, (input) =>
    handleThinkSeq(engine, input)
  );
}
