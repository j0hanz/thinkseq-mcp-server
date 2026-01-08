import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { RunDependencies } from '../src/app.js';
import {
  connectServer,
  createServer,
  installProcessErrorHandlers,
  installShutdownHandlers,
  run,
} from '../src/app.js';
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
  start: () => Promise.resolve(),
  send: () => Promise.resolve(),
  close: () => Promise.resolve(),
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

void describe('app.installProcessErrorHandlers exit override', () => {
  void it('uses provided exit handler and string errors', () => {
    const proc = createProcessStub();
    const logs: string[] = [];
    const exitCodes: number[] = [];

    installProcessErrorHandlers({
      processLike: proc,
      logError: (message) => logs.push(message),
      exit: (code) => exitCodes.push(code),
    });

    const handler = proc.handlers.get('unhandledRejection');
    assert.ok(handler);
    handler('oops');

    assert.deepEqual(logs, ['thinkseq: unhandledRejection: oops']);
    assert.deepEqual(exitCodes, [1]);
    assert.deepEqual(proc.exitCodes, []);
  });
});

void describe('app.installProcessErrorHandlers defaults', () => {
  void it('uses global process and console when deps omitted', () => {
    const originalOn = process.on;
    const originalExit = process.exit;
    const originalError = console.error;

    const handlers = new Map<string, (...args: unknown[]) => void>();
    const exitCodes: number[] = [];
    const logs: string[] = [];

    try {
      process.on = ((event: string, listener: (...args: unknown[]) => void) => {
        handlers.set(event, listener);
        return process;
      }) as typeof process.on;
      process.exit = ((code?: number) => {
        exitCodes.push(code ?? 0);
        return undefined as never;
      }) as typeof process.exit;
      console.error = (message: string) => logs.push(message);

      installProcessErrorHandlers();

      const handler = handlers.get('uncaughtException');
      assert.ok(handler);
      handler('boom');

      assert.deepEqual(logs, ['thinkseq: uncaughtException: boom']);
      assert.deepEqual(exitCodes, [1]);
    } finally {
      process.on = originalOn;
      process.exit = originalExit;
      console.error = originalError;
    }
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
      engine: harness.state.engine,
      transport: harness.state.transport,
    });
  });
});

void describe('app.createServer', () => {
  void it('creates a server with connect/registerTool', () => {
    const server = createServer('thinkseq', '1.0.0');
    assert.equal(typeof server.connect, 'function');
    assert.equal(typeof server.registerTool, 'function');
  });
});

void describe('app.connectServer', () => {
  void it('connects a server and returns the transport', async () => {
    let seenTransport: TransportLike | null = null;
    const server: ServerLike = {
      connect: (transport) => {
        seenTransport = transport as TransportLike;
        return Promise.resolve();
      },
      registerTool: () => {
        return {};
      },
    };
    const transport: TransportLike = {
      start: () => Promise.resolve(),
      send: () => Promise.resolve(),
      close: () => Promise.resolve(),
    };

    const result = await connectServer(server, () => transport);

    assert.equal(result, transport);
    assert.equal(seenTransport, transport);
  });
});

const tick = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 0));

void describe('app.installShutdownHandlers SIGTERM', () => {
  void it('closes resources and exits on SIGTERM', async () => {
    const proc = createProcessStub();
    const events: LifecycleEvent[] = [];
    const closed: string[] = [];

    installShutdownHandlers({
      processLike: proc,
      server: { close: () => closed.push('server') },
      engine: { close: () => closed.push('engine') },
      transport: {
        close: () => {
          closed.push('transport');
          throw new Error('close failed');
        },
      },
      publishLifecycleEvent: (event: LifecycleEvent) => events.push(event),
      now: () => 7,
      shutdownTimeoutMs: 1,
    });

    const handler = proc.handlers.get('SIGTERM');
    assert.ok(handler);
    handler();

    await tick();

    assert.deepEqual(events, [
      { type: 'lifecycle.shutdown', ts: 7, signal: 'SIGTERM' },
    ]);
    assert.deepEqual(proc.exitCodes, [0]);
    assert.deepEqual(closed, ['server', 'engine', 'transport']);
  });
});

void describe('app.installShutdownHandlers idempotency', () => {
  void it('ignores repeated shutdown signals', async () => {
    const proc = createProcessStub();
    let closes = 0;

    installShutdownHandlers({
      processLike: proc,
      server: { close: () => closes++ },
      engine: { close: () => closes++ },
      transport: { close: () => closes++ },
      publishLifecycleEvent: () => undefined,
      now: () => 1,
      shutdownTimeoutMs: 1,
    });

    const handler = proc.handlers.get('SIGINT');
    assert.ok(handler);
    handler();
    handler();

    await tick();

    assert.equal(proc.exitCodes.length, 1);
    assert.equal(closes, 3);
  });
});

void describe('app.installShutdownHandlers non-closable resources', () => {
  void it('skips objects without close method', async () => {
    const proc = createProcessStub();

    installShutdownHandlers({
      processLike: proc,
      server: {},
      engine: {},
      transport: {},
      publishLifecycleEvent: () => undefined,
      now: () => 1,
      shutdownTimeoutMs: 1,
    });

    const handler = proc.handlers.get('SIGTERM');
    assert.ok(handler);
    handler();

    await tick();

    assert.deepEqual(proc.exitCodes, [0]);
  });
});

void describe('app.installShutdownHandlers defaults', () => {
  void it('uses global process when processLike omitted', async () => {
    const originalOn = process.on;
    const originalExit = process.exit;
    const handlers = new Map<string, (...args: unknown[]) => void>();
    const exitCodes: number[] = [];

    try {
      process.on = ((event: string, listener: (...args: unknown[]) => void) => {
        handlers.set(event, listener);
        return process;
      }) as typeof process.on;
      process.exit = ((code?: number) => {
        exitCodes.push(code ?? 0);
        return undefined as never;
      }) as typeof process.exit;

      installShutdownHandlers({
        server: null,
        engine: 1,
        transport: { close: 123 },
        publishLifecycleEvent: () => undefined,
        now: () => 1,
        shutdownTimeoutMs: 1,
      });

      const handler = handlers.get('SIGINT');
      assert.ok(handler);
      handler();

      await tick();

      assert.deepEqual(exitCodes, [0]);
    } finally {
      process.on = originalOn;
      process.exit = originalExit;
    }
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
  engine: { processThought: () => unknown };
  registeredServer?: ServerLike;
  connectedServer?: ServerLike;
  shutdown?: { server: unknown; engine: unknown; transport: unknown };
}

const createRunState = (): RunState => {
  return {
    proc: createProcessStub(),
    events: [],
    calls: [],
    seenSignal: undefined,
    server: createServerStub(),
    transport: createTransportStub(),
    engine: { processThought: () => ({ ok: true, result: {} }) },
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
    engineFactory: () => state.engine as never,
    installShutdownHandlers: ({ server, engine, transport }) => {
      state.calls.push('shutdown');
      state.shutdown = { server, engine, transport };
    },
  };
};
