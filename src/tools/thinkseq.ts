import { performance } from 'node:perf_hooks';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type {
  ServerNotification,
  ServerRequest,
} from '@modelcontextprotocol/sdk/types.js';

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
  return raw === undefined || !FALSY_ENV_VALUES.has(raw.trim().toLowerCase());
}

const FALSY_ENV_VALUES = new Set(['0', 'false', 'no', 'off']);

const THINKSEQ_TOOL_DEFINITION = {
  title: 'Think Sequentially',
  description:
    'Record a concise thinking step (max 8000 chars). Be brief: capture only the essential insight, calculation, or decision.\n\nREVISION (DESTRUCTIVE REWIND): If you realize an earlier step was wrong, use `revisesThought` to correct it.\nRevising a thought will supersede (discard from the active chain) the target thought and all later active thoughts, then continue from the corrected step. Older thoughts remain preserved for audit.\n\nExample: { "thought": "Better approach: use caching", "revisesThought": 3 }\n\nReturns: thoughtNumber, progress (0-1), isComplete, revisableThoughts (+revisableThoughtsTotal), and recent thought previews.',
  inputSchema: ThinkSeqInputSchema,
  outputSchema: ThinkSeqOutputSchema,
};

interface ToolRegistrar {
  registerTool: McpServer['registerTool'];
}

type ThinkSeqInput = z.infer<typeof ThinkSeqInputSchema>;
type ThinkSeqOutput = z.infer<typeof ThinkSeqOutputSchema>;
type ToolExtra = RequestHandlerExtra<ServerRequest, ServerNotification>;

type ToolResponse =
  | ErrorResponse
  | {
      content: { type: 'text'; text: string }[];
      structuredContent: ThinkSeqOutput;
      isError?: boolean;
    };

function publishToolEnd(
  params:
    | { ok: true; durationMs: number }
    | { ok: false; durationMs: number; errorCode: string; errorMessage: string }
): void {
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

type ToolOutcome =
  | { ok: true; progress: number }
  | { ok: false; errorCode: string; errorMessage: string };

function finalizeToolEvent(
  outcome: ToolOutcome,
  durationMs: number,
  extra: ToolExtra | undefined
): void {
  if (outcome.ok) {
    publishToolEnd({ ok: true, durationMs });
    void sendProgress(extra, outcome.progress, 'completed');
    return;
  }
  publishToolEnd({
    ok: false,
    errorCode: outcome.errorCode,
    errorMessage: outcome.errorMessage,
    durationMs,
  });
  void sendProgress(extra, 1, 'failed');
}

function buildErrorResponse(
  code: string,
  message: string,
  includeTextContent: boolean
): ToolResponse {
  return createErrorResponse(code, message, undefined, { includeTextContent });
}

function buildToolResponse(
  result: ProcessResult,
  options: { includeTextContent: boolean }
): ToolResponse {
  if (!result.ok)
    return buildErrorResponse(
      result.error.code,
      result.error.message,
      options.includeTextContent
    );
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

async function sendProgress(
  extra: ToolExtra | undefined,
  progress: number,
  message?: string
): Promise<void> {
  const progressToken = extra?._meta?.progressToken;
  if (!extra || progressToken === undefined) return;

  await safeSendNotification(extra, progressToken, progress, message);
}

async function safeSendNotification(
  extra: ToolExtra,
  progressToken: string | number,
  progress: number,
  message?: string
): Promise<void> {
  try {
    await extra.sendNotification({
      method: 'notifications/progress',
      params: {
        progressToken,
        progress,
        total: 1,
        ...(message ? { message } : {}),
      },
    });
  } catch {
    // Ignore progress errors
  }
}

function resolveSessionId(input: ThinkSeqInput, extra?: ToolExtra): string {
  const meta = extra?._meta as Record<string, unknown> | undefined;
  if (!meta) return 'default';

  const candidates = [
    meta.sessionId,
    meta.conversationId,
    meta.threadId,
    meta.chatId,
    meta.clientId,
  ];
  const found = candidates.find(
    (c): c is string | number =>
      (typeof c === 'string' && c.trim().length > 0) ||
      (typeof c === 'number' && Number.isFinite(c))
  );

  if (typeof found === 'string') return found.trim();
  if (typeof found === 'number') return String(found);
  return 'default';
}

async function processThoughtWithTiming(
  engine: EngineLike,
  sessionId: string,
  normalized: ThoughtData,
  extra: ToolExtra | undefined,
  includeTextContent: boolean
): Promise<ToolResponse> {
  publishToolEvent({ type: 'tool.start', tool: 'thinkseq', ts: Date.now() });
  const start = performance.now();
  void sendProgress(extra, 0, 'started');

  try {
    const sessionEngine = engine as {
      processThoughtWithSession?: (
        id: string,
        d: ThoughtData
      ) => ProcessResult | Promise<ProcessResult>;
    };

    const result = await (sessionEngine.processThoughtWithSession
      ? sessionEngine.processThoughtWithSession(sessionId, normalized)
      : engine.processThought(normalized));

    const durationMs = getDurationMs(start);
    handleThoughtResult(result, durationMs, extra);
    return buildToolResponse(result, { includeTextContent });
  } catch (err) {
    return handleThoughtError(err, start, extra, includeTextContent);
  }
}

function handleThoughtResult(
  result: ProcessResult,
  durationMs: number,
  extra: ToolExtra | undefined
): void {
  if (result.ok) {
    finalizeToolEvent(
      { ok: true, progress: result.result.progress },
      durationMs,
      extra
    );
    return;
  }
  finalizeToolEvent(
    {
      ok: false,
      errorCode: result.error.code,
      errorMessage: result.error.message,
    },
    durationMs,
    extra
  );
}

function handleThoughtError(
  err: unknown,
  start: number,
  extra: ToolExtra | undefined,
  includeTextContent: boolean
): ToolResponse {
  const errorMessage = getErrorMessage(err);
  const durationMs = getDurationMs(start);
  finalizeToolEvent(
    { ok: false, errorCode: 'E_THINK', errorMessage },
    durationMs,
    extra
  );
  return buildErrorResponse('E_THINK', errorMessage, includeTextContent);
}

function buildThoughtData(input: ThinkSeqInput): ThoughtData {
  return {
    thought: input.thought,
    ...(input.totalThoughts !== undefined
      ? { totalThoughts: input.totalThoughts }
      : {}),
    ...(input.revisesThought !== undefined
      ? { revisesThought: input.revisesThought }
      : {}),
  };
}

async function handleThinkSeq(
  engine: EngineLike,
  input: ThinkSeqInput,
  extra?: ToolExtra
): Promise<ToolResponse> {
  const requestId = extra?.requestId;
  const context =
    requestId === undefined ? undefined : { requestId: String(requestId) };

  return runWithContext(async () => {
    const includeTextContent = resolveIncludeTextContent();
    const normalized = buildThoughtData(input);
    const sessionId = resolveSessionId(input, extra);
    return processThoughtWithTiming(
      engine,
      sessionId,
      normalized,
      extra,
      includeTextContent
    );
  }, context);
}

export function registerThinkSeq(
  server: ToolRegistrar,
  engine: EngineLike
): void {
  server.registerTool('thinkseq', THINKSEQ_TOOL_DEFINITION, (input, extra) =>
    handleThinkSeq(engine, input, extra)
  );
}
