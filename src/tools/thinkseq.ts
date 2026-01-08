import { performance } from 'node:perf_hooks';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { z } from 'zod';

import type { ThinkingEngine } from '../engine.js';
import { publishToolEvent } from '../lib/diagnostics.js';
import { createErrorResponse, getErrorMessage } from '../lib/errors.js';
import type { ThoughtData } from '../lib/types.js';
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

type ToolRegistrar = Pick<McpServer, 'registerTool'>;
type EngineLike = Pick<ThinkingEngine, 'processThought'>;
type ThinkSeqInput = z.input<typeof ThinkSeqInputSchema>;

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

export function registerThinkSeq(
  server: ToolRegistrar,
  engine: EngineLike
): void {
  server.registerTool('thinkseq', THINKSEQ_TOOL_DEFINITION, (input) => {
    const normalized = normalizeThoughtInput(input);
    publishToolEvent({
      type: 'tool.start',
      tool: 'thinkseq',
      ts: Date.now(),
    });
    const start = performance.now();
    try {
      const result = engine.processThought(normalized);
      const durationMs = Math.max(0, performance.now() - start);
      publishToolEvent({
        type: 'tool.end',
        tool: 'thinkseq',
        ts: Date.now(),
        ok: true,
        durationMs,
      });
      return {
        content: [{ type: 'text', text: JSON.stringify(result) }],
        structuredContent: result,
      };
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      const durationMs = Math.max(0, performance.now() - start);
      publishToolEvent({
        type: 'tool.end',
        tool: 'thinkseq',
        ts: Date.now(),
        ok: false,
        errorCode: 'E_THINK',
        errorMessage,
        durationMs,
      });
      return createErrorResponse('E_THINK', errorMessage);
    }
  });
}
