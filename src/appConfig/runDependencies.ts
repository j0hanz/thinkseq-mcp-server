import { readFile } from 'node:fs/promises';

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

async function readInstructionsText(): Promise<string> {
  try {
    return await readFile(INSTRUCTIONS_URL, { encoding: 'utf8' });
  } catch {
    return INSTRUCTIONS_FALLBACK;
  }
}

function loadServerInstructions(raw: string): string {
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : INSTRUCTIONS_FALLBACK;
}

const INSTRUCTIONS_RESOURCE_TEMPLATE = new ResourceTemplate(
  'internal://instructions',
  {
    list: () => ({
      resources: [
        {
          uri: 'internal://instructions',
          name: 'Instructions',
          mimeType: 'text/markdown',
        },
      ],
    }),
  }
);

const INSTRUCTIONS_METADATA = {
  title: 'Instructions',
  mimeType: 'text/markdown',
} as const;

const readInstructionsResource = (
  uri: URL
): { contents: { uri: string; text: string; mimeType: string }[] } => ({
  contents: [
    {
      uri: uri.href,
      text: INSTRUCTIONS_TEXT,
      mimeType: 'text/markdown',
    },
  ],
});

function registerInstructionsResource(server: ServerLike): void {
  server.registerResource(
    'instructions',
    INSTRUCTIONS_RESOURCE_TEMPLATE,
    INSTRUCTIONS_METADATA,
    readInstructionsResource
  );
}

const INSTRUCTIONS_TEXT = await readInstructionsText();
const SERVER_INSTRUCTIONS = loadServerInstructions(INSTRUCTIONS_TEXT);
const DEFAULT_PACKAGE_READ_TIMEOUT_MS = 2000;

export interface RunDependencies {
  processLike?: ProcessLike;
  packageReadTimeoutMs?: number;
  shutdownTimeoutMs?: number;
  readPackageJson?: (signal?: AbortSignal) => Promise<PackageInfo>;
  publishLifecycleEvent?: (event: LifecycleEvent) => void;
  createServer?: (name: string, version: string, icon?: string) => ServerLike;
  connectServer?: (
    server: ServerLike,
    createTransport?: () => TransportLike
  ) => Promise<TransportLike>;
  registerTool?: (
    server: ServerLike,
    engine: EngineLike,
    icon?: string
  ) => void;
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
  createServer: (name: string, version: string, icon?: string) => ServerLike;
  connectServer: (
    server: ServerLike,
    createTransport?: () => TransportLike
  ) => Promise<TransportLike>;
  registerTool: (server: ServerLike, engine: EngineLike, icon?: string) => void;
  engineFactory: () => EngineLike;
  installShutdownHandlers: (deps: ShutdownDependencies) => void;
  now: () => number;
}

type McpServerOptions = ConstructorParameters<typeof McpServer>[1];
type ServerCapabilities = Exclude<
  NonNullable<McpServerOptions>['capabilities'],
  undefined
>;

function buildServerCapabilities(
  overrides: Partial<ServerCapabilities> = {}
): ServerCapabilities {
  return {
    logging: {},
    tools: { listChanged: false },
    resources: { subscribe: false, listChanged: false },
    prompts: { listChanged: false },
    ...overrides,
  };
}

const defaultCreateServer = (
  name: string,
  version: string,
  icon?: string
): ServerLike => {
  const capabilities = buildServerCapabilities();
  const server = new McpServer(
    { name, version },
    {
      instructions: SERVER_INSTRUCTIONS,
      capabilities,
      ...(icon
        ? {
            icons: [{ src: icon, mimeType: 'image/svg+xml', sizes: ['any'] }],
          }
        : {}),
    }
  );
  registerInstructionsResource(server);

  server.registerPrompt(
    'get-help',
    {
      description: 'Get usage instructions for this server',
    },
    () => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: SERVER_INSTRUCTIONS,
          },
        },
      ],
    })
  );

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

function resolveSystemDeps(
  deps: RunDependencies
): Pick<
  ResolvedRunDependencies,
  'processLike' | 'packageReadTimeoutMs' | 'now' | 'shutdownTimeoutMs'
> {
  return {
    processLike: deps.processLike ?? process,
    packageReadTimeoutMs:
      deps.packageReadTimeoutMs ?? DEFAULT_PACKAGE_READ_TIMEOUT_MS,
    now: deps.now ?? Date.now,
    ...(deps.shutdownTimeoutMs !== undefined
      ? { shutdownTimeoutMs: deps.shutdownTimeoutMs }
      : {}),
  };
}

function resolveAppDeps(
  deps: RunDependencies
): Omit<
  ResolvedRunDependencies,
  'processLike' | 'packageReadTimeoutMs' | 'now' | 'shutdownTimeoutMs'
> {
  return {
    readPackageJson: deps.readPackageJson ?? readSelfPackageJson,
    publishLifecycleEvent: deps.publishLifecycleEvent ?? publishLifecycleEvent,
    createServer: deps.createServer ?? defaultCreateServer,
    connectServer: deps.connectServer ?? defaultConnectServer,
    registerTool: deps.registerTool ?? registerThinkSeq,
    engineFactory: deps.engineFactory ?? (() => new ThinkingEngine()),
    installShutdownHandlers:
      deps.installShutdownHandlers ?? installShutdownHandlers,
  };
}

export function resolveRunDependencies(
  deps: RunDependencies
): ResolvedRunDependencies {
  return {
    ...resolveSystemDeps(deps),
    ...resolveAppDeps(deps),
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
