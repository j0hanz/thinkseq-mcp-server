import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createErrorResponse, getErrorMessage } from '../src/lib/errors.js';

void describe('errors.getErrorMessage', () => {
  void it('returns message for Error', () => {
    assert.equal(getErrorMessage(new Error('boom')), 'boom');
  });

  void it('returns string as-is', () => {
    assert.equal(getErrorMessage('ok'), 'ok');
  });

  void it('falls back to unknown for non-string', () => {
    assert.equal(getErrorMessage(null), 'Unknown error');
  });
});

void describe('errors.createErrorResponse', () => {
  void it('builds error response without result', () => {
    const response = createErrorResponse('E_TEST', 'nope');
    assert.equal(response.isError, true);
    assert.deepEqual(
      JSON.parse(response.content[0]?.text ?? '{}'),
      response.structuredContent
    );
    assert.equal('result' in response.structuredContent, false);
  });

  void it('builds error response with result', () => {
    const response = createErrorResponse('E_TEST', 'nope', { ok: false });
    assert.deepEqual(response.structuredContent.result, { ok: false });
  });
});
