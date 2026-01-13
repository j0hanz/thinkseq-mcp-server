import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { getCliHelpText, parseCliConfig } from '../src/lib/cli.js';

void describe('cli.parseCliConfig', () => {
  void it('parses numeric options', () => {
    const { config, help } = parseCliConfig([
      '--max-thoughts',
      '12',
      '--max-memory-mb',
      '64',
      '--shutdown-timeout-ms',
      '9000',
      '--package-read-timeout-ms',
      '123',
    ]);

    assert.equal(help, false);
    assert.equal(config.maxThoughts, 12);
    assert.equal(config.maxMemoryBytes, 64 * 1024 * 1024);
    assert.equal(config.shutdownTimeoutMs, 9000);
    assert.equal(config.packageReadTimeoutMs, 123);
  });

  void it('sets help flag', () => {
    const { help } = parseCliConfig(['--help']);
    assert.equal(help, true);
  });

  void it('rejects unknown options', () => {
    assert.throws(() => parseCliConfig(['--unknown']));
  });

  void it('rejects invalid numeric values', () => {
    assert.throws(() => parseCliConfig(['--max-thoughts', '0']));
    assert.throws(() => parseCliConfig(['--max-memory-mb', 'abc']));
  });

  void it('returns help text', () => {
    assert.match(getCliHelpText(), /Usage: thinkseq/);
  });
});
