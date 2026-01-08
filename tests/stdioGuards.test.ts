import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
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
