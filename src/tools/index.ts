import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { ThinkingEngine } from '../engine.js';
import { registerThinkSeq } from './thinkseq.js';

export function registerAllTools(
  server: McpServer,
  engine: ThinkingEngine
): void {
  registerThinkSeq(server, engine);
}
