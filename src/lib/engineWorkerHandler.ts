import { getErrorMessage } from './errors.js';
import type { ProcessResult, ThoughtData } from './types.js';
import type {
  EngineWorkerRequest,
  EngineWorkerResponse,
} from './workerProtocol.js';
import { isEngineWorkerRequest } from './workerProtocol.js';

interface EngineProcessor {
  processThought: (input: ThoughtData) => ProcessResult;
}

interface WorkerHandlerDeps {
  engine: EngineProcessor;
  post: (message: EngineWorkerResponse) => void;
}

function buildProtocolError(): EngineWorkerResponse {
  return {
    id: 'unknown',
    ok: false,
    error: {
      code: 'E_PROTOCOL',
      message: 'Invalid worker request',
    },
  };
}

function buildEngineSuccess(
  id: string,
  result: ProcessResult
): EngineWorkerResponse {
  return {
    id,
    ok: true,
    result,
  };
}

function buildEngineError(id: string, err: unknown): EngineWorkerResponse {
  return {
    id,
    ok: false,
    error: {
      code: 'E_ENGINE',
      message: getErrorMessage(err),
    },
  };
}

export function handleEngineWorkerMessage(
  raw: unknown,
  deps: WorkerHandlerDeps
): void {
  if (!isEngineWorkerRequest(raw)) {
    deps.post(buildProtocolError());
    return;
  }

  const request = raw satisfies EngineWorkerRequest;

  try {
    const result = deps.engine.processThought(request.input);
    deps.post(buildEngineSuccess(request.id, result));
  } catch (err) {
    deps.post(buildEngineError(request.id, err));
  }
}
