import assert from 'node:assert/strict';
import { it } from 'node:test';

import { handleEngineWorkerMessage } from '../src/lib/engineWorkerHandler.js';
import type { ProcessResult } from '../src/lib/types.js';
import type {
  EngineWorkerRequest,
  EngineWorkerResponse,
} from '../src/lib/workerProtocol.js';

const createResult = (): ProcessResult => ({
  ok: true,
  result: {
    thoughtNumber: 1,
    totalThoughts: 1,
    progress: 1,
    nextThoughtNeeded: false,
    thoughtHistoryLength: 1,
    branches: [],
    context: { recentThoughts: [], hasRevisions: false },
  },
});

const createRequest = (): EngineWorkerRequest => ({
  id: 'req-1',
  method: 'processThought',
  input: {
    thought: 'x',
    thoughtNumber: 1,
    totalThoughts: 1,
    nextThoughtNeeded: false,
  },
});

void it('engineWorkerHandler returns protocol error for invalid request', () => {
  const messages: EngineWorkerResponse[] = [];

  handleEngineWorkerMessage(null, {
    engine: { processThought: () => createResult() },
    post: (message) => messages.push(message),
  });

  assert.equal(messages.length, 1);
  const message = messages[0];
  assert.equal(message.ok, false);
  const errorMessage = message as Extract<EngineWorkerResponse, { ok: false }>;
  assert.equal(errorMessage.error.code, 'E_PROTOCOL');
});

void it('engineWorkerHandler processes valid requests', () => {
  const messages: EngineWorkerResponse[] = [];
  const result = createResult();
  const request = createRequest();

  handleEngineWorkerMessage(request, {
    engine: { processThought: () => result },
    post: (message) => messages.push(message),
  });

  assert.equal(messages.length, 1);
  assert.equal(messages[0].ok, true);
  assert.equal(messages[0].id, request.id);
  assert.deepEqual(messages[0].result, result);
});

void it('engineWorkerHandler returns engine error when processing throws', () => {
  const messages: EngineWorkerResponse[] = [];
  const request = createRequest();

  handleEngineWorkerMessage(request, {
    engine: {
      processThought: () => {
        throw new Error('boom');
      },
    },
    post: (message) => messages.push(message),
  });

  assert.equal(messages.length, 1);
  const message = messages[0];
  assert.equal(message.ok, false);
  const errorMessage = message as Extract<EngineWorkerResponse, { ok: false }>;
  assert.equal(errorMessage.id, request.id);
  assert.equal(errorMessage.error.code, 'E_ENGINE');
  assert.equal(errorMessage.error.message, 'boom');
});
