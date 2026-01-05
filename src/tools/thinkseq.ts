import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { ThinkingEngine } from '../engine.js';
import { publishToolEvent } from '../lib/diagnostics.js';
import { createErrorResponse, getErrorMessage } from '../lib/errors.js';
import { createToolResponse } from '../lib/tool_response.js';
import { ThinkSeqInputSchema } from '../schemas/inputs.js';
import { ThinkSeqOutputSchema } from '../schemas/outputs.js';

export function registerThinkSeq(
  server: McpServer,
  engine: ThinkingEngine
): void {
  server.registerTool(
    'thinkseq',
    {
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
      annotations: {
        readOnlyHint: false,
        idempotentHint: false,
      },
    },
    (input) => {
      publishToolEvent({
        type: 'tool.start',
        tool: 'thinkseq',
        ts: Date.now(),
      });
      try {
        const result = engine.processThought(input);
        publishToolEvent({
          type: 'tool.end',
          tool: 'thinkseq',
          ts: Date.now(),
          ok: true,
        });
        return createToolResponse(result);
      } catch (err) {
        publishToolEvent({
          type: 'tool.end',
          tool: 'thinkseq',
          ts: Date.now(),
          ok: false,
          errorCode: 'E_THINK',
          errorMessage: getErrorMessage(err),
        });
        return createErrorResponse('E_THINK', getErrorMessage(err));
      }
    }
  );
}
