import { readFile } from 'node:fs/promises';
import process from 'node:process';

import type { RunDependencies } from './appConfig/runDependencies.js';
import {
  resolvePackageIdentity,
  resolveRunDependencies,
} from './appConfig/runDependencies.js';
import { buildShutdownDependencies } from './appConfig/shutdown.js';
import type { ProcessLike } from './appConfig/types.js';
import { installConsoleBridge, installMcpLogging } from './lib/mcpLogging.js';

interface ProcessErrorHandlerDeps {
  processLike?: ProcessLike;
  logError?: (message: string) => void;
  exit?: (code: number) => void;
}

type ErrorLabel = 'unhandledRejection' | 'uncaughtException';

const toError = (value: unknown): Error =>
  value instanceof Error ? value : new Error(String(value));

const createExit = (
  proc: ProcessLike,
  exit?: (code: number) => void
): ((code: number) => void) => exit ?? ((code: number) => proc.exit(code));

const createHandlerFor =
  (logError: (message: string) => void, exit: (code: number) => void) =>
  (label: ErrorLabel) =>
  (value: unknown): void => {
    const error = toError(value);
    logError(`thinkseq: ${label}: ${error.message}`);
    exit(1);
  };

async function getLocalIconData(): Promise<string | undefined> {
  try {
    const iconPath = new URL('../assets/logo.svg', import.meta.url);
    const buffer = await readFile(iconPath);
    if (buffer.length > 2 * 1024 * 1024) {
      console.warn('Warning: logo.svg is larger than 2MB');
    }
    return `data:image/svg+xml;base64,${buffer.toString('base64')}`;
  } catch {
    return undefined;
  }
}

export function installProcessErrorHandlers(
  deps: ProcessErrorHandlerDeps = {}
): void {
  const proc = deps.processLike ?? process;
  const logError = deps.logError ?? console.error;
  const exit = createExit(proc, deps.exit);
  const handlerFor = createHandlerFor(logError, exit);

  proc.on('unhandledRejection', handlerFor('unhandledRejection'));
  proc.on('uncaughtException', handlerFor('uncaughtException'));
}

export async function run(deps: RunDependencies = {}): Promise<void> {
  const resolved = resolveRunDependencies(deps);
  const pkg = await resolved.readPackageJson(
    AbortSignal.timeout(resolved.packageReadTimeoutMs)
  );
  const { name, version } = resolvePackageIdentity(pkg);

  const localIcon = await getLocalIconData();
  const server = resolved.createServer(name, version, localIcon);
  installMcpLogging(server);
  const { flush: flushConsole, restore: restoreConsole } =
    installConsoleBridge(server);
  process.on('exit', restoreConsole);

  resolved.publishLifecycleEvent({
    type: 'lifecycle.started',
    ts: resolved.now(),
  });

  const engine = resolved.engineFactory();
  resolved.registerTool(server, engine, localIcon);

  const transport = await resolved.connectServer(server);
  flushConsole();
  resolved.installShutdownHandlers(
    buildShutdownDependencies(resolved, { server, engine, transport })
  );
}
