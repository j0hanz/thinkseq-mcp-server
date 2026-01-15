import { ErrorCode } from '@modelcontextprotocol/sdk/types.js';

interface StdioMessageTransportLike {
  onmessage?: (message: unknown, extra?: unknown) => void;
  send?: (message: unknown) => Promise<void>;
  onerror?: (error: unknown) => void;
}

type JsonRpcId = number | string | null;

const INIT_FIRST_ERROR_MESSAGE = 'initialize must be the first request';

function isStdioMessageTransport(
  value: unknown
): value is StdioMessageTransportLike {
  if (!value || typeof value !== 'object') return false;
  const transport = value;
  return (
    typeof Reflect.get(transport, 'onmessage') === 'function' &&
    typeof Reflect.get(transport, 'send') === 'function'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isValidJsonRpcId(value: unknown): value is JsonRpcId {
  return (
    value === null || typeof value === 'string' || typeof value === 'number'
  );
}

type JsonRpcMethodMessage =
  | { method: string; params?: unknown; hasId: false }
  | { method: string; params?: unknown; hasId: true; id: JsonRpcId };

function parseJsonRpcMethodMessage(
  message: unknown
): JsonRpcMethodMessage | undefined {
  if (!isRecord(message)) return undefined;
  const { method } = message;
  if (typeof method !== 'string') return undefined;
  const { params } = message;
  if (!('id' in message)) {
    return { method, params, hasId: false };
  }
  const { id } = message;
  if (!isValidJsonRpcId(id)) return undefined;
  return { method, id, params, hasId: true };
}

function parseJsonRpcResponse(
  message: unknown
): { id: JsonRpcId; error?: unknown } | undefined {
  if (!isRecord(message)) return undefined;
  if (!('id' in message)) return undefined;
  const { id } = message;
  if (!isValidJsonRpcId(id)) return undefined;
  const hasResult = 'result' in message;
  const hasError = 'error' in message;
  if (!hasResult && !hasError) return undefined;
  const { error } = message;
  return { id, error: hasError ? error : undefined };
}

function getIdKey(id: JsonRpcId): string {
  return id === null ? 'null' : String(id);
}

function sendError(
  transport: StdioMessageTransportLike,
  code: number,
  message: string,
  id: JsonRpcId = null
): void {
  const sendPromise = transport.send?.({
    jsonrpc: '2.0',
    id,
    error: {
      code,
      message,
    },
  });
  sendPromise?.catch(() => {
    return;
  });
}

function isInvalidJsonRpcMessageShape(message: unknown): boolean {
  return (
    message === null || typeof message !== 'object' || Array.isArray(message)
  );
}

function isParseError(error: unknown): boolean {
  return error instanceof SyntaxError;
}

function isSchemaError(error: unknown): boolean {
  return error instanceof Error && error.name === 'ZodError';
}

export function installStdioInitializationGuards(transport: unknown): void {
  if (!isStdioMessageTransport(transport)) return;

  const originalOnMessage = transport.onmessage;
  if (!originalOnMessage) return;

  const state = {
    sawInitialize: false,
    pendingInitIds: new Set<string>(),
  };

  if (transport.send) {
    const originalSend = transport.send.bind(transport);
    transport.send = (message: unknown) => {
      try {
        const response = parseJsonRpcResponse(message);
        if (response) {
          const key = getIdKey(response.id);
          if (state.pendingInitIds.has(key)) {
            state.pendingInitIds.delete(key);
            if (response.error === undefined) {
              state.sawInitialize = true;
            }
          }
        }
      } catch {
        // Ignore send inspection errors.
      }
      return originalSend(message);
    };
  }

  transport.onmessage = (message: unknown, extra?: unknown) => {
    const methodMessage = parseJsonRpcMethodMessage(message);
    if (methodMessage) {
      if (methodMessage.method === 'initialize') {
        if (!methodMessage.hasId) {
          // initialize must be a request (not a notification).
          return;
        }
        // DELEGATION: We intentionally skip manual protocolVersion checks here and
        // let the SDK handle version negotiation. This prevents this guard from
        // becoming a maintenance burden or rejecting valid newer versions.
        state.pendingInitIds.add(getIdKey(methodMessage.id));
        originalOnMessage(message, extra);
        return;
      }

      if (!state.sawInitialize) {
        if (methodMessage.hasId) {
          sendError(
            transport,
            ErrorCode.InvalidRequest,
            INIT_FIRST_ERROR_MESSAGE,
            methodMessage.id
          );
        }
        return;
      }
    }

    originalOnMessage(message, extra);
  };
}

export function installStdioInvalidMessageGuards(transport: unknown): void {
  if (!isStdioMessageTransport(transport)) return;

  const originalOnMessage = transport.onmessage;
  if (!originalOnMessage) return;

  transport.onmessage = (message: unknown, extra?: unknown) => {
    // MCP stdio is line-delimited JSON-RPC (one object per line). JSON-RPC
    // batching is removed in newer revisions; treat arrays as invalid.
    if (isInvalidJsonRpcMessageShape(message)) {
      sendError(transport, ErrorCode.InvalidRequest, 'Invalid Request');
      return;
    }

    originalOnMessage(message, extra);
  };
}

export function installStdioParseErrorResponder(transport: unknown): void {
  if (!isStdioMessageTransport(transport)) return;

  const originalOnError = transport.onerror;
  transport.onerror = (error: unknown) => {
    originalOnError?.(error);

    if (isParseError(error)) {
      sendError(transport, ErrorCode.ParseError, 'Parse error');
      return;
    }

    if (isSchemaError(error)) {
      sendError(transport, ErrorCode.InvalidRequest, 'Invalid Request');
    }
  };
}
