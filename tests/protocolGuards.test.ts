import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';

import { installInitializationGuards } from '../src/lib/protocolGuards.js';

type RequestHandler = (request: unknown, extra: unknown) => unknown;

const createServerStub = () => {
  const handlers = new Map<unknown, unknown>();
  const protocol: Record<string, unknown> = { _requestHandlers: handlers };
  const server: Record<string, unknown> = { server: protocol };
  return { handlers, protocol, server };
};

const getHandler = (
  handlers: Map<unknown, unknown>,
  name: string
): RequestHandler => {
  const handler = handlers.get(name);
  assert.equal(typeof handler, 'function');
  return handler as RequestHandler;
};

void describe('protocolGuards.installInitializationGuards', () => {
  void it('guards initialize and allows subsequent calls', async () => {
    const { handlers, protocol, server } = createServerStub();
    const calls: string[] = [];

    handlers.set('initialize', async () => {
      calls.push('init');
      return 'ok';
    });
    handlers.set('do', async () => {
      calls.push('do');
      return 'done';
    });
    handlers.set(42, async () => {
      calls.push('numeric');
      return 'skip';
    });
    handlers.set('noop', 'not-a-function');

    installInitializationGuards(server);

    const initHandler = getHandler(handlers, 'initialize');
    await initHandler({ params: { protocolVersion: '2025-11-25' } }, {});

    const doHandler = getHandler(handlers, 'do');
    await doHandler({}, {});

    assert.deepStrictEqual(calls, ['init', 'do']);
    assert.equal(typeof protocol.fallbackRequestHandler, 'function');
  });

  void it('rejects pre-initialize calls', async () => {
    const { handlers, server } = createServerStub();
    handlers.set('do', async () => 'done');

    installInitializationGuards(server);

    const doHandler = getHandler(handlers, 'do');
    await assert.rejects(
      async () => {
        await doHandler({}, {});
      },
      (err) => err instanceof McpError && err.code === ErrorCode.InvalidRequest
    );
  });

  void it('rejects unsupported protocol versions', async () => {
    const { handlers, server } = createServerStub();
    handlers.set('initialize', async () => 'ok');

    installInitializationGuards(server);

    const initHandler = getHandler(handlers, 'initialize');
    await assert.rejects(
      async () => {
        await initHandler({ params: { protocolVersion: '0.0.0' } }, {});
      },
      (err) => err instanceof McpError && err.code === ErrorCode.InvalidRequest
    );
  });

  void it('rejects initialize when protocolVersion is missing', async () => {
    const { handlers, server } = createServerStub();
    handlers.set('initialize', async () => 'ok');

    installInitializationGuards(server);

    const initHandler = getHandler(handlers, 'initialize');
    await assert.rejects(
      async () => {
        await initHandler({ params: {} }, {});
      },
      (err) => err instanceof McpError && err.code === ErrorCode.InvalidRequest
    );
  });

  void it('rejects initialize when protocolVersion is not a string', async () => {
    const { handlers, server } = createServerStub();
    handlers.set('initialize', async () => 'ok');

    installInitializationGuards(server);

    const initHandler = getHandler(handlers, 'initialize');
    await assert.rejects(
      async () => {
        await initHandler({ params: { protocolVersion: 123 } }, {});
      },
      (err) => err instanceof McpError && err.code === ErrorCode.InvalidRequest
    );
  });

  void it('rejects protocolVersion 2025-03-26 (batching unsupported)', async () => {
    const { handlers, server } = createServerStub();
    handlers.set('initialize', async () => 'ok');

    installInitializationGuards(server);

    const initHandler = getHandler(handlers, 'initialize');
    await assert.rejects(
      async () => {
        await initHandler({ params: { protocolVersion: '2025-03-26' } }, {});
      },
      (err) => err instanceof McpError && err.code === ErrorCode.InvalidRequest
    );
  });
});
