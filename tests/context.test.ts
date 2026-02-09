import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { getRequestContext, runWithContext } from '../src/lib/context.js';

void describe('runWithContext', () => {
  void it('creates a context when none exists', () => {
    const context = runWithContext(() => getRequestContext());
    assert.ok(context);
    assert.equal(typeof context.requestId, 'string');
    assert.ok(context.requestId.length > 0);
    assert.equal(typeof context.startedAt, 'number');
    assert.equal(typeof context.startedAtEpochMs, 'number');
  });

  void it('reuses the existing context when no overrides are provided', () => {
    const result = runWithContext(() => {
      const outer = getRequestContext();
      assert.ok(outer);

      const inner = runWithContext(() => getRequestContext());
      assert.ok(inner);

      return { outer, inner };
    });

    assert.equal(result.outer.requestId, result.inner.requestId);
    assert.equal(result.outer.startedAt, result.inner.startedAt);
    assert.equal(result.outer.startedAtEpochMs, result.inner.startedAtEpochMs);
  });
});
