import type { ProcessResult, ThoughtData } from './types.js';

export interface EngineWorkerRequest {
  id: string;
  method: 'processThought';
  input: ThoughtData;
}

export type EngineWorkerResponse =
  | {
      id: string;
      ok: true;
      result: ProcessResult;
    }
  | {
      id: string;
      ok: false;
      error: {
        code: string;
        message: string;
      };
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function isEngineWorkerRequest(
  value: unknown
): value is EngineWorkerRequest {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === 'string' &&
    value.method === 'processThought' &&
    isRecord(value.input)
  );
}

export function isEngineWorkerResponse(
  value: unknown
): value is EngineWorkerResponse {
  if (!isRecord(value)) return false;
  if (typeof value.id !== 'string') return false;
  if (value.ok === true) return 'result' in value;
  if (value.ok === false) return isRecord(value.error);
  return false;
}
