import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  installStdioInitializationGuards,
  installStdioInvalidMessageGuards,
  installStdioParseErrorResponder,
} from '../src/lib/stdioGuards.js';

const createTransport = () => {
  const sent: unknown[] = [];
  const seen: unknown[] = [];
  const errors: unknown[] = [];

  return {
    sent,
    seen,
    errors,
    onmessage: (message: unknown) => {
      seen.push(message);
    },
    onerror: (error: unknown) => {
      errors.push(error);
    },
    send: (message: unknown) => {
      sent.push(message);
      return Promise.resolve();
    },
  };
};

void describe('stdioGuards.installStdioInitializationGuards', () => {
  void it('rejects requests before initialize', async () => {
    const transport = createTransport();

    installStdioInitializationGuards(transport);
    assert.ok(transport.onmessage);

    transport.onmessage({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
    });

    await Promise.resolve();

    assert.equal(transport.sent.length, 1);
    assert.equal(transport.seen.length, 0);
  });

  void it('blocks notifications before initialize', async () => {
    const transport = createTransport();

    installStdioInitializationGuards(transport);
    assert.ok(transport.onmessage);

    transport.onmessage({
      jsonrpc: '2.0',
      method: 'tools/list',
    });

    await Promise.resolve();

    assert.equal(transport.sent.length, 0);
    assert.equal(transport.seen.length, 0);
  });

  void it('passes initialize when protocolVersion is missing (delegates to SDK)', async () => {
    const transport = createTransport();

    installStdioInitializationGuards(transport);
    assert.ok(transport.onmessage);

    transport.onmessage({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {},
    });

    await Promise.resolve();

    assert.equal(transport.sent.length, 0);
    assert.equal(transport.seen.length, 1);
  });

  void it('passes initialize when protocolVersion is unsupported (delegates to SDK)', async () => {
    const transport = createTransport();

    installStdioInitializationGuards(transport);
    assert.ok(transport.onmessage);

    transport.onmessage({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-03-26' },
    });

    await Promise.resolve();

    assert.equal(transport.sent.length, 0);
    assert.equal(transport.seen.length, 1);
  });

  void it('allows requests after notifications/initialized', async () => {
    const transport = createTransport();

    installStdioInitializationGuards(transport);
    assert.ok(transport.onmessage);

    transport.onmessage({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-11-25' },
    });

    transport.onmessage({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
    });

    await transport.send({ jsonrpc: '2.0', id: 1, result: {} });

    transport.onmessage({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/list',
    });

    transport.onmessage({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    });

    transport.onmessage({
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/list',
    });

    await Promise.resolve();

    assert.equal(transport.sent.length, 3);
    assert.equal(transport.seen.length, 3);
  });
});

void describe('stdioGuards.installStdioInvalidMessageGuards', () => {
  void it('sends invalid request for malformed messages', async () => {
    const transport = createTransport();

    installStdioInvalidMessageGuards(transport);
    assert.ok(transport.onmessage);

    transport.onmessage(null);
    transport.onmessage([]);
    transport.onmessage(42);

    await Promise.resolve();

    assert.equal(transport.sent.length, 3);
    assert.equal(transport.seen.length, 0);
  });

  void it('passes valid messages to original handler', () => {
    const transport = createTransport();

    installStdioInvalidMessageGuards(transport);
    assert.ok(transport.onmessage);

    transport.onmessage({ jsonrpc: '2.0' });

    assert.equal(transport.sent.length, 0);
    assert.deepEqual(transport.seen, [{ jsonrpc: '2.0' }]);
  });

  void it('ignores non-transport inputs', () => {
    installStdioInvalidMessageGuards({});
    installStdioInvalidMessageGuards({ onmessage: () => undefined });
  });
});

void describe('stdioGuards.installStdioParseErrorResponder', () => {
  void it('sends invalid request for parse errors', async () => {
    const transport = createTransport();

    installStdioParseErrorResponder(transport);
    assert.ok(transport.onerror);

    transport.onerror(new SyntaxError('bad'));
    transport.onerror(new Error('nope'));
    const zodError = new Error('zod');
    zodError.name = 'ZodError';
    transport.onerror(zodError);

    await Promise.resolve();

    assert.equal(transport.errors.length, 3);
    assert.equal(transport.sent.length, 2);
  });

  void it('ignores non-transport inputs', () => {
    installStdioParseErrorResponder({});
    installStdioParseErrorResponder({ onerror: () => undefined });
  });
});
