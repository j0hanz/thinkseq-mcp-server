import { parentPort } from 'node:worker_threads';

import { ThinkingEngine } from '../engine.js';
import { handleEngineWorkerMessage } from '../lib/engineWorkerHandler.js';
import type { EngineWorkerResponse } from '../lib/workerProtocol.js';

if (!parentPort) {
  throw new Error('engineWorker: parentPort is not available');
}

const port = parentPort;

const engine = new ThinkingEngine();

function post(message: EngineWorkerResponse): void {
  port.postMessage(message);
}

port.on('message', (raw: unknown) => {
  handleEngineWorkerMessage(raw, { engine, post });
});
