import { parentPort } from 'node:worker_threads';

import { ThinkingEngine } from '../engine.js';
import { getErrorMessage } from '../lib/errors.js';
import type {
  EngineWorkerRequest,
  EngineWorkerResponse,
} from '../lib/workerProtocol.js';
import { isEngineWorkerRequest } from '../lib/workerProtocol.js';

if (!parentPort) {
  throw new Error('engineWorker: parentPort is not available');
}

const port = parentPort;

const engine = new ThinkingEngine();

function post(message: EngineWorkerResponse): void {
  port.postMessage(message);
}

port.on('message', (raw: unknown) => {
  if (!isEngineWorkerRequest(raw)) {
    post({
      id: 'unknown',
      ok: false,
      error: {
        code: 'E_PROTOCOL',
        message: 'Invalid worker request',
      },
    });
    return;
  }

  const request = raw satisfies EngineWorkerRequest;

  try {
    const result = engine.processThought(request.input);
    post({
      id: request.id,
      ok: true,
      result,
    });
  } catch (err) {
    post({
      id: request.id,
      ok: false,
      error: {
        code: 'E_ENGINE',
        message: getErrorMessage(err),
      },
    });
  }
});
