import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';

import { getErrorMessage } from './errors.js';
import type { ProcessResult, ThoughtData } from './types.js';
import type {
  EngineWorkerRequest,
  EngineWorkerResponse,
} from './workerProtocol.js';
import { isEngineWorkerResponse } from './workerProtocol.js';

interface WorkerLike {
  on: (
    event: 'message' | 'messageerror' | 'error' | 'exit',
    listener: (...args: unknown[]) => void
  ) => void;
  postMessage: (message: EngineWorkerRequest) => void;
  terminate: () => Promise<unknown>;
}

type WorkerFactory = (entry: URL) => WorkerLike;

export interface WorkerEngineClientOptions {
  timeoutMs?: number;
  maxInflight?: number;
  workerFactory?: WorkerFactory;
  entryExists?: (entry: URL) => boolean;
  entryBaseUrl?: string;
}

interface Inflight {
  resolve: (value: ProcessResult) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

function getDistWorkerEntryUrl(baseUrl: string = import.meta.url): URL {
  if (baseUrl.includes('/dist/')) {
    return new URL('../workers/engineWorker.js', baseUrl);
  }
  return new URL('../../dist/workers/engineWorker.js', baseUrl);
}

function hasDistWorkerEntry(entry: URL): boolean {
  try {
    return existsSync(fileURLToPath(entry));
  } catch {
    return false;
  }
}

export class WorkerEngineClient {
  readonly #worker: WorkerLike;
  readonly #timeoutMs: number;
  readonly #maxInflight: number;
  #closed = false;
  #counter = 0;
  readonly #inflight = new Map<string, Inflight>();

  constructor(options: WorkerEngineClientOptions = {}) {
    this.#timeoutMs = options.timeoutMs ?? 5000;
    this.#maxInflight = options.maxInflight ?? 100;

    const entry = getDistWorkerEntryUrl(options.entryBaseUrl);
    this.#worker = this.#createWorker(
      entry,
      options.workerFactory,
      options.entryExists
    );
    this.#attachWorkerHandlers();
  }

  #createWorker(
    entry: URL,
    workerFactory?: WorkerFactory,
    entryExists?: (entry: URL) => boolean
  ): WorkerLike {
    if (workerFactory) {
      return workerFactory(entry);
    }

    const exists = entryExists ?? hasDistWorkerEntry;
    if (!exists(entry)) {
      throw new Error(
        `Worker engine entry not found at ${fileURLToPath(entry)}. Run "npm run build".`
      );
    }

    return new Worker(entry, {
      argv: [],
    });
  }

  #attachWorkerHandlers(): void {
    this.#worker.on('message', (value: unknown) => {
      this.#onMessage(value);
    });

    this.#worker.on('messageerror', (err) => {
      this.#failAll('E_WORKER_MESSAGE', getErrorMessage(err));
    });

    this.#worker.on('error', (err) => {
      this.#failAll('E_WORKER_ERROR', getErrorMessage(err));
    });

    this.#worker.on('exit', (code) => {
      if (code !== 0) {
        this.#failAll(
          'E_WORKER_EXIT',
          `Worker exited with code ${String(code)}`
        );
        return;
      }
      this.#failAll('E_WORKER_EXIT', 'Worker exited');
    });
  }

  async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    this.#failAll('E_WORKER_CLOSED', 'Worker engine client closed');

    try {
      await this.#worker.terminate();
    } catch {
      return;
    }
  }

  processThought(input: ThoughtData): Promise<ProcessResult> {
    const failure = this.#getProcessFailure();
    if (failure) return Promise.reject(failure);

    const id = this.#nextId();
    const request = this.#buildRequest(id, input);
    return this.#dispatchRequest(id, request);
  }

  #getProcessFailure(): Error | null {
    if (this.#closed) {
      return new Error('Worker engine client is closed');
    }

    if (this.#inflight.size >= this.#maxInflight) {
      return new Error(
        'Worker engine backpressure: too many inflight requests'
      );
    }

    return null;
  }

  #nextId(): string {
    this.#counter += 1;
    return String(this.#counter);
  }

  #buildRequest(id: string, input: ThoughtData): EngineWorkerRequest {
    return {
      id,
      method: 'processThought',
      input,
    };
  }

  #dispatchRequest(
    id: string,
    request: EngineWorkerRequest
  ): Promise<ProcessResult> {
    return new Promise<ProcessResult>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.#inflight.delete(id);
        reject(
          new Error(
            `Worker engine request timed out after ${String(this.#timeoutMs)}ms`
          )
        );
      }, this.#timeoutMs);

      this.#inflight.set(id, { resolve, reject, timeout });

      try {
        this.#worker.postMessage(request);
      } catch (err) {
        clearTimeout(timeout);
        this.#inflight.delete(id);
        reject(new Error(getErrorMessage(err)));
      }
    });
  }

  #onMessage(value: unknown): void {
    if (!isEngineWorkerResponse(value)) return;

    const message = value satisfies EngineWorkerResponse;
    const inflight = this.#inflight.get(message.id);
    if (!inflight) return;

    clearTimeout(inflight.timeout);
    this.#inflight.delete(message.id);

    if (message.ok) {
      inflight.resolve(message.result);
      return;
    }

    inflight.reject(
      new Error(`Worker error ${message.error.code}: ${message.error.message}`)
    );
  }

  #failAll(code: string, message: string): void {
    for (const [id, inflight] of this.#inflight.entries()) {
      clearTimeout(inflight.timeout);
      inflight.reject(new Error(`${code}: ${message}`));
      this.#inflight.delete(id);
    }
  }
}
