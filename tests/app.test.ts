import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import type { RunDependencies } from '../src/app.js';
import { installProcessErrorHandlers, run } from '../src/app.js';
import type { LifecycleEvent } from '../src/lib/diagnostics.js';

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
    assert.deepEqual(harness.events, [{ type: 'lifecycle.started', ts: 42 }]);
    assert.deepEqual(harness.calls, [
      'create:thinkseq:0.0.0',
      'register:ok',
      'connect:ok',
      'shutdown:ok',
    ]);
  });
});

const createRunHarness = (): {
  deps: RunDependencies;
  events: LifecycleEvent[];
  calls: string[];
  getSignal: () => AbortSignal | undefined;
} => {
  const state = createRunState();
  const deps = buildRunDependencies(state);
  return {
    deps,
    events: state.events,
    calls: state.calls,
    getSignal: () => state.seenSignal,
  };
};

interface RunState {
  proc: ProcessStub;
  events: LifecycleEvent[];
  calls: string[];
  seenSignal?: AbortSignal;
  server: McpServer;
  transport: StdioServerTransport;
}

const createRunState = (): RunState => {
  return {
    proc: createProcessStub(),
    events: [],
    calls: [],
    seenSignal: undefined,
    server: { id: 'server' } as unknown as McpServer,
    transport: { id: 'transport' } as unknown as StdioServerTransport,
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
    connectServer: (value) => {
      state.calls.push(value === state.server ? 'connect:ok' : 'connect:bad');
      return Promise.resolve(state.transport);
    },
    registerTool: (value, engine) => {
      void engine;
      state.calls.push(value === state.server ? 'register:ok' : 'register:bad');
    },
    installShutdownHandlers: ({ server, transport }) => {
      state.calls.push(
        server === state.server && transport === state.transport
          ? 'shutdown:ok'
          : 'shutdown:bad'
      );
    },
  };
};
