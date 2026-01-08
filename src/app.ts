import {
  buildShutdownDependencies,
  type ProcessLike,
  resolvePackageIdentity,
  resolveRunDependencies,
  type RunDependencies,
} from './appConfig.js';
import { installInitializationGuards } from './lib/protocolGuards.js';

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

  resolved.publishLifecycleEvent({
    type: 'lifecycle.started',
    ts: resolved.now(),
  });

  const server = resolved.createServer(name, version);
  const engine = resolved.engineFactory();
  resolved.registerTool(server, engine);
  installInitializationGuards(server);

  const transport = await resolved.connectServer(server);
  resolved.installShutdownHandlers(
    buildShutdownDependencies(resolved, { server, engine, transport })
  );
}
