import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { ThinkingEngine } from '../engine.js';
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
      title: 'Think Sequentialtly',
      description: `This tool helps you structure your thinking process in a sequential manner.
    
Use this when you need to:
- Break down complex problems into manageable steps
- Explore multiple solution paths (branching)
- Revise earlier thinking based on new insights
- Track your reasoning process

Parameters:
- thought: Your current thinking step
- thoughtNumber: Current step number (starts at 1)
- totalThoughts: Estimated total steps (can adjust as you go)
- nextThoughtNeeded: Set false only when you have a final answer
- branchFromThought/branchId: Create alternative reasoning paths
- isRevision/revisesThought: Correct earlier thoughts
- thoughtType: Optional categorization (analysis/hypothesis/verification/conclusion)`,
      inputSchema: ThinkSeqInputSchema,
      outputSchema: ThinkSeqOutputSchema,
      annotations: {
        readOnlyHint: false,
        idempotentHint: false, // Each thought changes state
      },
    },
    (input, _extra) => {
      void _extra;
      try {
        const result = engine.processThought(input);
        return createToolResponse(result);
      } catch (err) {
        return createErrorResponse('E_THINK', getErrorMessage(err));
      }
    }
  );
}
