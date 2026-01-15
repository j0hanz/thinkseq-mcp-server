import { readFileSync } from 'node:fs';

import {
  McpServer,
  ResourceTemplate,
} from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { ThinkingEngine } from '../engine.js';
import { publishLifecycleEvent } from '../lib/diagnostics.js';
import type { LifecycleEvent } from '../lib/diagnostics.js';
import type { PackageInfo } from '../lib/package.js';
import { readSelfPackageJson } from '../lib/package.js';
import {
  installStdioInitializationGuards,
  installStdioInvalidMessageGuards,
  installStdioParseErrorResponder,
} from '../lib/stdioGuards.js';
import { registerThinkSeq } from '../tools/thinkseq.js';
import type { ShutdownDependencies } from './shutdown.js';
import { installShutdownHandlers } from './shutdown.js';
import type {
  EngineLike,
  ProcessLike,
  ServerLike,
  TransportLike,
} from './types.js';

const INSTRUCTIONS_URL = new URL('../instructions.md', import.meta.url);
const INSTRUCTIONS_FALLBACK =
  'ThinkSeq is a tool for structured, sequential thinking with revision support.';

function readInstructionsText(): string {
  try {
    return readFileSync(INSTRUCTIONS_URL, { encoding: 'utf8' });
  } catch {
    return INSTRUCTIONS_FALLBACK;
  }
}

function loadServerInstructions(): string {
  const raw = readInstructionsText();
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : INSTRUCTIONS_FALLBACK;
}

function registerInstructionsResource(server: ServerLike): void {
  server.registerResource(
    'instructions',
    new ResourceTemplate('internal://instructions', { list: undefined }),
    { title: 'Instructions', mimeType: 'text/markdown' },
    (uri: URL) => ({
      contents: [
        {
          uri: uri.href,
          text: readInstructionsText(),
          mimeType: 'text/markdown',
        },
      ],
    })
  );
}

const SERVER_INSTRUCTIONS = loadServerInstructions();
const DEFAULT_PACKAGE_READ_TIMEOUT_MS = 2000;

export interface RunDependencies {
  processLike?: ProcessLike;
  packageReadTimeoutMs?: number;
  shutdownTimeoutMs?: number;
  readPackageJson?: (signal?: AbortSignal) => Promise<PackageInfo>;
  publishLifecycleEvent?: (event: LifecycleEvent) => void;
  createServer?: (name: string, version: string) => ServerLike;
  connectServer?: (
    server: ServerLike,
    createTransport?: () => TransportLike
  ) => Promise<TransportLike>;
  registerTool?: (server: ServerLike, engine: EngineLike) => void;
  engineFactory?: () => EngineLike;
  installShutdownHandlers?: (deps: ShutdownDependencies) => void;
  now?: () => number;
}

export interface ResolvedRunDependencies {
  processLike: ProcessLike;
  packageReadTimeoutMs: number;
  shutdownTimeoutMs?: number;
  readPackageJson: (signal?: AbortSignal) => Promise<PackageInfo>;
  publishLifecycleEvent: (event: LifecycleEvent) => void;
  createServer: (name: string, version: string) => ServerLike;
  connectServer: (
    server: ServerLike,
    createTransport?: () => TransportLike
  ) => Promise<TransportLike>;
  registerTool: (server: ServerLike, engine: EngineLike) => void;
  engineFactory: () => EngineLike;
  installShutdownHandlers: (deps: ShutdownDependencies) => void;
  now: () => number;
}

const defaultCreateServer = (name: string, version: string): ServerLike => {
  const server = new McpServer(
    { name, version },
    {
      instructions: SERVER_INSTRUCTIONS,
      capabilities: { logging: {}, tools: { listChanged: true } },
    }
  );
  registerInstructionsResource(server);
  return server;
};

const defaultConnectServer = async (
  server: ServerLike,
  createTransport: () => TransportLike = () => new StdioServerTransport()
): Promise<TransportLike> => {
  const transport = createTransport();
  await server.connect(transport);
  installStdioInitializationGuards(transport);
  installStdioInvalidMessageGuards(transport);
  installStdioParseErrorResponder(transport);
  return transport;
};

export function resolveRunDependencies(
  deps: RunDependencies
): ResolvedRunDependencies {
  return {
    processLike: deps.processLike ?? process,
    packageReadTimeoutMs:
      deps.packageReadTimeoutMs ?? DEFAULT_PACKAGE_READ_TIMEOUT_MS,
    readPackageJson: deps.readPackageJson ?? readSelfPackageJson,
    publishLifecycleEvent: deps.publishLifecycleEvent ?? publishLifecycleEvent,
    createServer: deps.createServer ?? defaultCreateServer,
    connectServer: deps.connectServer ?? defaultConnectServer,
    registerTool: deps.registerTool ?? registerThinkSeq,
    engineFactory: deps.engineFactory ?? (() => new ThinkingEngine()),
    installShutdownHandlers:
      deps.installShutdownHandlers ?? installShutdownHandlers,
    now: deps.now ?? Date.now,
    ...(deps.shutdownTimeoutMs !== undefined
      ? { shutdownTimeoutMs: deps.shutdownTimeoutMs }
      : {}),
  };
}

export function resolvePackageIdentity(pkg: PackageInfo): {
  name: string;
  version: string;
} {
  return {
    name: pkg.name ?? 'thinkseq',
    version: pkg.version ?? '0.0.0',
  };
}
