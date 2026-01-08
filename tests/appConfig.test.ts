import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type {
  RunDependencies,
  ServerLike,
  ShutdownDependencies,
} from '../src/appConfig.js';
import {
  buildShutdownDependencies,
  resolvePackageIdentity,
  resolveRunDependencies,
} from '../src/appConfig.js';
import { ThinkingEngine } from '../src/engine.js';

type ProcessStub = {
  handlers: Map<string, (...args: unknown[]) => void>;
  exitCodes: number[];
  on: (event: string, listener: (...args: unknown[]) => void) => void;
  exit: (code: number) => void;
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

const waitFor = async (
  predicate: () => boolean,
  timeoutMs = 50
): Promise<void> => {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('Timed out waiting for condition');
    }
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
};

void describe('appConfig.resolvePackageIdentity', () => {
  void it('uses defaults when name/version missing', () => {
    assert.deepStrictEqual(resolvePackageIdentity({}), {
      name: 'thinkseq',
      version: '0.0.0',
    });

    assert.deepStrictEqual(
      resolvePackageIdentity({ name: 'custom', version: '1.2.3' }),
      { name: 'custom', version: '1.2.3' }
    );
  });
});

void describe('appConfig.resolveRunDependencies', () => {
  void it('provides defaults for core/server/engine deps', async () => {
    const resolved = resolveRunDependencies({});

    assert.equal(resolved.processLike, process);
    assert.equal(resolved.packageReadTimeoutMs, 2000);

    const server = resolved.createServer('thinkseq', '0.0.0');
    assert.equal(typeof server.connect, 'function');
    assert.equal(typeof server.registerTool, 'function');

    let connected = false;
    const stubServer: ServerLike = {
      connect: async (transport) => {
        connected = true;
        assert.ok(transport);
      },
      registerTool: () => ({}),
    };

    const transport = await resolved.connectServer(stubServer);
    assert.ok(connected);
    assert.equal(transport !== undefined, true);

    const engine = resolved.engineFactory();
    assert.ok(engine instanceof ThinkingEngine);
  });

  void it('uses provided overrides when supplied', () => {
    const proc = createProcessStub();
    const readPackageJson = async () => ({ name: 'override' });
    const publishLifecycleEvent = () => {};
    const createServer = (): ServerLike => ({
      connect: async () => undefined,
      registerTool: () => undefined,
    });
    const connectServer = async () => ({});
    const registerTool = () => undefined;
    const engineFactory = () => ({ processThought: () => ({ ok: true }) });
    const installShutdownHandlers = () => undefined;
    const now = () => 123;

    const deps: RunDependencies = {
      processLike: proc,
      packageReadTimeoutMs: 12,
      shutdownTimeoutMs: 34,
      readPackageJson,
      publishLifecycleEvent,
      createServer,
      connectServer,
      registerTool,
      engineFactory,
      installShutdownHandlers,
      now,
    };

    const resolved = resolveRunDependencies(deps);
    assert.equal(resolved.processLike, proc);
    assert.equal(resolved.packageReadTimeoutMs, 12);
    assert.equal(resolved.readPackageJson, readPackageJson);
    assert.equal(resolved.publishLifecycleEvent, publishLifecycleEvent);
    assert.equal(resolved.createServer, createServer);
    assert.equal(resolved.connectServer, connectServer);
    assert.equal(resolved.registerTool, registerTool);
    assert.equal(resolved.engineFactory, engineFactory);
    assert.equal(resolved.installShutdownHandlers, installShutdownHandlers);
    assert.equal(resolved.now, now);
    assert.equal(resolved.shutdownTimeoutMs, 34);
  });
});

void describe('appConfig.shutdown helpers', () => {
  void it('builds shutdown dependencies with timeout', () => {
    const proc = createProcessStub();
    const resolved = resolveRunDependencies({
      processLike: proc,
      shutdownTimeoutMs: 99,
      publishLifecycleEvent: () => undefined,
      now: () => 1,
    });
    const deps = buildShutdownDependencies(resolved, {
      server: { close: () => undefined },
      engine: { close: () => undefined },
      transport: { close: () => undefined },
    });

    assert.equal(deps.processLike, proc);
    assert.equal(deps.shutdownTimeoutMs, 99);
  });

  void it('builds shutdown dependencies without timeout', () => {
    const proc = createProcessStub();
    const resolved = resolveRunDependencies({ processLike: proc });
    const deps = buildShutdownDependencies(resolved, {
      server: {},
      engine: {},
      transport: {},
    });

    assert.equal(deps.processLike, proc);
    assert.ok(!('shutdownTimeoutMs' in deps));
  });

  void it('handles shutdown, closes resources, and ignores errors', async () => {
    const proc = createProcessStub();
    const events: Array<{ type: string; ts: number; signal: string }> = [];
    const closes: string[] = [];

    const deps: ShutdownDependencies = {
      processLike: proc,
      server: {
        close: () => {
          closes.push('server');
        },
      },
      engine: {
        close: async () => {
          closes.push('engine');
          throw new Error('boom');
        },
      },
      transport: {
        close: () => {
          closes.push('transport');
          return new Promise<void>(() => undefined);
        },
      },
      publishLifecycleEvent: (event) => {
        events.push(event as { type: string; ts: number; signal: string });
      },
      now: () => 123,
      shutdownTimeoutMs: 1,
    };

    const resolved = resolveRunDependencies({
      processLike: proc,
      shutdownTimeoutMs: 1,
    });

    resolved.installShutdownHandlers(deps);

    const handler = proc.handlers.get('SIGTERM');
    assert.ok(handler);
    handler();
    await waitFor(() => proc.exitCodes.length > 0);

    assert.deepStrictEqual(proc.exitCodes, [0]);
    assert.deepStrictEqual(events, [
      { type: 'lifecycle.shutdown', ts: 123, signal: 'SIGTERM' },
    ]);
    assert.ok(closes.includes('server'));
    assert.ok(closes.includes('engine'));
    assert.ok(closes.includes('transport'));

    handler();
    await new Promise((resolve) => setTimeout(resolve, 5));
    assert.deepStrictEqual(proc.exitCodes, [0]);
  });

  void it('tolerates resources without close method', async () => {
    const proc = createProcessStub();
    const deps: ShutdownDependencies = {
      processLike: proc,
      server: null,
      engine: {},
      transport: undefined,
      shutdownTimeoutMs: 1,
    };

    const resolved = resolveRunDependencies({ processLike: proc });
    resolved.installShutdownHandlers(deps);

    const handler = proc.handlers.get('SIGINT');
    assert.ok(handler);
    handler();
    await waitFor(() => proc.exitCodes.length > 0);

    assert.deepStrictEqual(proc.exitCodes, [0]);
  });
});
