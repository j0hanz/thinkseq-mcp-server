import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { RunDependencies } from '../src/app.js';
import { installProcessErrorHandlers, run } from '../src/app.js';
import type { LifecycleEvent } from '../src/lib/diagnostics.js';

type ServerLike =
  NonNullable<RunDependencies['createServer']> extends (
    name: string,
    version: string
  ) => infer S
    ? S
    : never;

type TransportLike = Awaited<
  ReturnType<NonNullable<RunDependencies['connectServer']>>
>;

interface ProcessStub {
  on: (event: string, listener: (...args: unknown[]) => void) => void;
  exit: (code: number) => void;
  handlers: Map<string, (...args: unknown[]) => void>;
  exitCodes: number[];
}

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

const createServerStub = (): ServerLike => ({
  registerTool: () => {
    return {};
  },
  connect: () => Promise.resolve(),
});

const createTransportStub = (): TransportLike => ({
  close: () => {
    return undefined;
  },
});

void describe('app.installProcessErrorHandlers', () => {
  void it('logs and exits on unhandledRejection', () => {
    const proc = createProcessStub();
    const logs: string[] = [];

    installProcessErrorHandlers({
      processLike: proc,
      logError: (message) => logs.push(message),
    });

    const handler = proc.handlers.get('unhandledRejection');
    assert.ok(handler);
    handler(new Error('boom'));

    assert.deepEqual(logs, ['thinkseq: unhandledRejection: boom']);
    assert.deepEqual(proc.exitCodes, [1]);
  });

  void it('logs and exits on uncaughtException', () => {
    const proc = createProcessStub();
    const logs: string[] = [];

    installProcessErrorHandlers({
      processLike: proc,
      logError: (message) => logs.push(message),
    });

    const handler = proc.handlers.get('uncaughtException');
    assert.ok(handler);
    handler(new Error('bad'));

    assert.deepEqual(logs, ['thinkseq: uncaughtException: bad']);
    assert.deepEqual(proc.exitCodes, [1]);
  });
});

void describe('app.run', () => {
  void it('wires dependencies and starts lifecycle', async () => {
    const harness = createRunHarness();

    await run(harness.deps);

    assert.ok(harness.getSignal());
    assert.deepEqual(harness.state.events, [
      { type: 'lifecycle.started', ts: 42 },
    ]);
    assert.deepEqual(harness.state.calls, [
      'create:thinkseq:0.0.0',
      'register',
      'connect',
      'shutdown',
    ]);
    assert.equal(harness.state.registeredServer, harness.state.server);
    assert.equal(harness.state.connectedServer, harness.state.server);
    assert.deepEqual(harness.state.shutdown, {
      server: harness.state.server,
      transport: harness.state.transport,
    });
  });
});

const createRunHarness = (): {
  deps: RunDependencies;
  state: RunState;
  getSignal: () => AbortSignal | undefined;
} => {
  const state = createRunState();
  const deps = buildRunDependencies(state);
  return {
    deps,
    state,
    getSignal: () => state.seenSignal,
  };
};

interface RunState {
  proc: ProcessStub;
  events: LifecycleEvent[];
  calls: string[];
  seenSignal?: AbortSignal;
  server: ServerLike;
  transport: TransportLike;
  registeredServer?: ServerLike;
  connectedServer?: ServerLike;
  shutdown?: { server: unknown; transport: unknown };
}

const createRunState = (): RunState => {
  return {
    proc: createProcessStub(),
    events: [],
    calls: [],
    seenSignal: undefined,
    server: createServerStub(),
    transport: createTransportStub(),
    registeredServer: undefined,
    connectedServer: undefined,
    shutdown: undefined,
  };
};

const buildRunDependencies = (state: RunState): RunDependencies => {
  return {
    processLike: state.proc,
    now: () => 42,
    packageReadTimeoutMs: 5,
    readPackageJson: (signal) => {
      state.seenSignal = signal;
      return Promise.resolve({});
    },
    publishLifecycleEvent: (event) => state.events.push(event),
    createServer: (name, version) => {
      state.calls.push(`create:${name}:${version}`);
      return state.server;
    },
    connectServer: (server) => {
      state.calls.push('connect');
      state.connectedServer = server;
      return Promise.resolve(state.transport);
    },
    registerTool: (server, engine) => {
      void engine;
      state.calls.push('register');
      state.registeredServer = server;
    },
    installShutdownHandlers: ({ server, transport }) => {
      state.calls.push('shutdown');
      state.shutdown = { server, transport };
    },
  };
};
