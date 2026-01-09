import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { ThinkingEngine } from '../engine.js';

export type CloseFn = () => Promise<void> | void;
export type ProcessLike = Pick<typeof process, 'on' | 'exit'>;
export type TransportLike = Parameters<McpServer['connect']>[0];
export type ServerLike = Pick<McpServer, 'connect' | 'registerTool'>;
export type EngineLike = Pick<ThinkingEngine, 'processThought'> & {
  close?: CloseFn;
};
