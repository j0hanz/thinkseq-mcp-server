import { performance } from 'node:perf_hooks';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { z } from 'zod';

import { runWithContext } from '../lib/context.js';
import { publishToolEvent } from '../lib/diagnostics.js';
import type { ErrorResponse } from '../lib/errors.js';
import { createErrorResponse, getErrorMessage } from '../lib/errors.js';
import type { EngineLike, ProcessResult, ThoughtData } from '../lib/types.js';
import { ThinkSeqInputSchema } from '../schemas/inputs.js';
import { ThinkSeqOutputSchema } from '../schemas/outputs.js';

function resolveIncludeTextContent(): boolean {
  const raw = process.env.THINKSEQ_INCLUDE_TEXT_CONTENT;
  if (raw === undefined) return true;
  switch (raw.trim().toLowerCase()) {
    case '0':
    case 'false':
    case 'no':
    case 'off':
      return false;
    default:
      return true;
  }
}

const THINKSEQ_TOOL_DEFINITION = {
  title: 'Think Sequentially',
  description: `Record a concise thinking step (max 5000 chars). Be brief: capture only the essential insight, calculation, or decision.

REVISION (DESTRUCTIVE REWIND): If you realize an earlier step was wrong, use \`revisesThought\` to correct it.
Revising a thought will supersede (discard from the active chain) the target thought and all later active thoughts, then continue from the corrected step. Older thoughts remain preserved for audit.

Example: { "thought": "Better approach: use caching", "revisesThought": 3 }

Returns: thoughtNumber, progress (0-1), isComplete, revisableThoughts (+revisableThoughtsTotal), and recent thought previews.`,
  inputSchema: ThinkSeqInputSchema,
  outputSchema: ThinkSeqOutputSchema,
};

interface ToolRegistrar {
  registerTool: McpServer['registerTool'];
}

type ThinkSeqInput = z.infer<typeof ThinkSeqInputSchema>;
type ThinkSeqOutput = z.infer<typeof ThinkSeqOutputSchema>;

type ToolResponse =
  | ErrorResponse
  | {
      content: { type: 'text'; text: string }[];
      structuredContent: ThinkSeqOutput;
      isError?: boolean;
    };

function publishToolStart(): void {
  publishToolEvent({
    type: 'tool.start',
    tool: 'thinkseq',
    ts: Date.now(),
  });
}

type ToolEndParams =
  | { ok: true; durationMs: number }
  | { ok: false; durationMs: number; errorCode: string; errorMessage: string };

function publishToolEnd(params: ToolEndParams): void {
  publishToolEvent({
    type: 'tool.end',
    tool: 'thinkseq',
    ts: Date.now(),
    ...(params.ok
      ? { ok: true, durationMs: params.durationMs }
      : {
          ok: false,
          errorCode: params.errorCode,
          errorMessage: params.errorMessage,
          durationMs: params.durationMs,
        }),
  });
}

function buildErrorResponse(
  code: string,
  message: string,
  includeTextContent: boolean
): ToolResponse {
  return createErrorResponse(code, message, undefined, {
    includeTextContent,
  });
}

function buildToolResponse(
  result: ProcessResult,
  options: { includeTextContent: boolean }
): ToolResponse {
  if (!result.ok) {
    return buildErrorResponse(
      result.error.code,
      result.error.message,
      options.includeTextContent
    );
  }
  const structured: ThinkSeqOutput = {
    ok: true,
    result: {
      ...result.result,
      context: {
        ...result.result.context,
        recentThoughts: [...result.result.context.recentThoughts],
      },
    },
  };
  return {
    content: options.includeTextContent
      ? [{ type: 'text', text: JSON.stringify(structured) }]
      : [],
    structuredContent: structured,
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
    const includeTextContent = resolveIncludeTextContent();
    const normalized: ThoughtData = {
      thought: input.thought,
      ...(input.totalThoughts !== undefined && {
        totalThoughts: input.totalThoughts,
      }),
      ...(input.revisesThought !== undefined && {
        revisesThought: input.revisesThought,
      }),
    };
    publishToolStart();
    const start = performance.now();
    try {
      const result = await engine.processThought(normalized);
      const durationMs = getDurationMs(start);
      if (result.ok) {
        publishToolEnd({ ok: true, durationMs });
      } else {
        publishToolEnd({
          ok: false,
          errorCode: result.error.code,
          errorMessage: result.error.message,
          durationMs,
        });
      }
      return buildToolResponse(result, { includeTextContent });
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      const durationMs = getDurationMs(start);
      publishToolEnd({
        ok: false,
        errorCode: 'E_THINK',
        errorMessage,
        durationMs,
      });
      return buildErrorResponse('E_THINK', errorMessage, includeTextContent);
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
