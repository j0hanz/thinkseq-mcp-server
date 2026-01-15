import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { installProcessErrorHandlers, run } from '../src/app.js';
import type { LifecycleEvent } from '../src/lib/diagnostics.js';

type ProcessStub = {
  on: (event: string, listener: (...args: unknown[]) => void) => void;
  exit: (code: number) => void;
  handlers: Map<string, (...args: unknown[]) => void>;
  exitCodes: number[];
};

const createProcessStub = (): ProcessStub => {
  const handlers = new Map<string, (...args: unknown[]) => void>();
  const exitCodes: number[] = [];
  return {
    handlers,
    exitCodes,
    on: (event, listener) => {
      handlers.set(event, listener);
    },
    exit: (code) => {
      exitCodes.push(code);
    },
  };
};

void describe('app.installProcessErrorHandlers', () => {
  void it('logs and exits on unhandledRejection/uncaughtException', () => {
    const proc = createProcessStub();
    const logs: string[] = [];
    const exitCodes: number[] = [];

    installProcessErrorHandlers({
      processLike: proc,
      logError: (message) => logs.push(message),
      exit: (code) => exitCodes.push(code),
    });

    const unhandled = proc.handlers.get('unhandledRejection');
    assert.ok(unhandled);
    unhandled(new Error('boom'));

    const uncaught = proc.handlers.get('uncaughtException');
    assert.ok(uncaught);
    uncaught('bad');

    assert.deepEqual(logs, [
      'thinkseq: unhandledRejection: boom',
      'thinkseq: uncaughtException: bad',
    ]);
    assert.deepEqual(exitCodes, [1, 1]);
    assert.deepEqual(proc.exitCodes, []);
  });

  void it('uses process exit when exit handler not provided', () => {
    const proc = createProcessStub();
    const logs: string[] = [];

    installProcessErrorHandlers({
      processLike: proc,
      logError: (message) => logs.push(message),
    });

    const unhandled = proc.handlers.get('unhandledRejection');
    assert.ok(unhandled);
    unhandled('oops');

    assert.deepEqual(proc.exitCodes, [1]);
    assert.deepEqual(logs, ['thinkseq: unhandledRejection: oops']);
  });
});

void describe('app.run', () => {
  void it('wires dependencies and starts lifecycle', async () => {
    const state = createRunState();

    await run(buildRunDependencies(state));

    assert.ok(state.seenSignal);
    assert.deepEqual(state.events, [{ type: 'lifecycle.started', ts: 42 }]);
    assert.deepEqual(state.calls, [
      'create:thinkseq:0.0.0',
      'register',
      'connect',
      'shutdown',
    ]);
    assert.equal(state.registeredServer, state.server);
    assert.equal(state.connectedServer, state.server);
    assert.deepEqual(state.shutdown, {
      server: state.server,
      engine: state.engine,
      transport: state.transport,
    });
  });

  void it('passes shutdown timeout when provided', async () => {
    const state = createRunState();

    await run({
      ...buildRunDependencies(state),
      shutdownTimeoutMs: 1234,
    });

    assert.equal(state.shutdown?.shutdownTimeoutMs, 1234);
  });
});

type RunState = {
  proc: ProcessStub;
  events: LifecycleEvent[];
  calls: string[];
  seenSignal?: AbortSignal;
  server: {
    registerTool: () => unknown;
    connect: (transport: unknown) => Promise<void>;
    sendLoggingMessage: () => Promise<void>;
  };
  transport: {
    start: () => Promise<void>;
    send: () => Promise<void>;
    close: () => Promise<void>;
  };
  engine: { processThought: () => unknown };
  registeredServer?: RunState['server'];
  connectedServer?: RunState['server'];
  shutdown?: {
    server: unknown;
    engine: unknown;
    transport: unknown;
    shutdownTimeoutMs?: number;
  };
};

const createRunState = (): RunState => {
  return {
    proc: createProcessStub(),
    events: [],
    calls: [],
    seenSignal: undefined,
    server: {
      registerTool: () => ({}),
      connect: () => Promise.resolve(),
      sendLoggingMessage: () => Promise.resolve(),
    },
    transport: {
      start: () => Promise.resolve(),
      send: () => Promise.resolve(),
      close: () => Promise.resolve(),
    },
    engine: { processThought: () => ({ ok: true, result: {} }) },
    registeredServer: undefined,
    connectedServer: undefined,
    shutdown: undefined,
  };
};

const buildRunDependencies = (state: RunState) => {
  return {
    processLike: state.proc,
    now: () => 42,
    packageReadTimeoutMs: 5,
    readPackageJson: (signal?: AbortSignal) => {
      state.seenSignal = signal;
      return Promise.resolve({});
    },
    publishLifecycleEvent: (event: LifecycleEvent) => {
      state.events.push(event);
    },
    createServer: (name: string, version: string) => {
      state.calls.push(`create:${name}:${version}`);
      return state.server;
    },
    connectServer: (server: RunState['server']) => {
      state.calls.push('connect');
      state.connectedServer = server;
      return Promise.resolve(state.transport);
    },
    registerTool: (server: RunState['server']) => {
      state.calls.push('register');
      state.registeredServer = server;
    },
    engineFactory: () => state.engine,
    installShutdownHandlers: ({
      server,
      engine,
      transport,
      shutdownTimeoutMs,
    }: {
      server: unknown;
      engine: unknown;
      transport: unknown;
      shutdownTimeoutMs?: number;
    }) => {
      state.calls.push('shutdown');
      state.shutdown = {
        server,
        engine,
        transport,
        ...(shutdownTimeoutMs !== undefined && { shutdownTimeoutMs }),
      };
    },
  };
};
