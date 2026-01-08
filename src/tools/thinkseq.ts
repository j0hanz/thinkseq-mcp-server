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
  description: `Record a concise thinking step (max 2000 chars). Be brief: capture only the essential insight, calculation, or decision.

REVISION: If you realize an earlier step was wrong or want to try a different approach, use \`revisesThought\` to correct it. Both versions are preserved for audit.

Example: { "thought": "Better approach: use caching", "revisesThought": 3 }

Returns: thoughtNumber, progress (0-1), isComplete, revisableThoughts, and recent thought previews.`,
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

type ThinkSeqInput = z.infer<z.ZodObject<typeof ThinkSeqInputSchema>>;

interface StructuredResult {
  [x: string]: unknown;
  thoughtNumber: number;
  totalThoughts: number;
  progress: number;
  isComplete: boolean;
  thoughtHistoryLength: number;
  hasRevisions: boolean;
  activePathLength: number;
  revisableThoughts: number[];
  context: {
    recentThoughts: readonly { number: number; preview: string }[];
    revisionInfo?: {
      revises: number;
      supersedes: number[];
    };
  };
}

type ToolResponse =
  | ErrorResponse
  | {
      content: { type: 'text'; text: string }[];
      structuredContent: StructuredResult;
    };

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
  if (!result.ok) {
    return createErrorResponse(result.error.code, result.error.message);
  }
  return {
    content: [{ type: 'text', text: JSON.stringify(result.result) }],
    structuredContent: result.result,
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
    const normalized: ThoughtData = {
      thought: input.thought,
      totalThoughts: input.totalThoughts,
      ...(input.revisesThought !== undefined && {
        revisesThought: input.revisesThought,
      }),
    };
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
