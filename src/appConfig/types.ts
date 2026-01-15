import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export type { CloseFn, EngineLike } from '../lib/types.js';
export type ProcessLike = Pick<typeof process, 'on' | 'exit'>;
export type TransportLike = Parameters<McpServer['connect']>[0];
export type ServerLike = Pick<
  McpServer,
  'connect' | 'registerTool' | 'sendLoggingMessage'
>;
