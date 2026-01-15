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

function wrapSendForInitTracking(
  transport: StdioMessageTransportLike,
  state: { sawInitialize: boolean; pendingInitIds: Set<string> }
): void {
  if (!transport.send) return;
  const originalSend = transport.send.bind(transport);
  transport.send = (message: unknown) => {
    trackInitializeResponse(message, state);
    return originalSend(message);
  };
}

function trackInitializeResponse(
  message: unknown,
  state: { sawInitialize: boolean; pendingInitIds: Set<string> }
): void {
  try {
    const response = parseJsonRpcResponse(message);
    if (!response) return;
    const key = getIdKey(response.id);
    if (!state.pendingInitIds.has(key)) return;
    state.pendingInitIds.delete(key);
    if (response.error === undefined) {
      state.sawInitialize = true;
    }
  } catch {
    // Ignore send inspection errors.
  }
}

function handleInitializeMethod(
  methodMessage: JsonRpcMethodMessage & { hasId: true },
  state: { sawInitialize: boolean; pendingInitIds: Set<string> },
  originalOnMessage: (message: unknown, extra?: unknown) => void,
  message: unknown,
  extra?: unknown
): boolean {
  state.pendingInitIds.add(getIdKey(methodMessage.id));
  originalOnMessage(message, extra);
  return true;
}

function handleNonInitializedRequest(
  methodMessage: JsonRpcMethodMessage,
  transport: StdioMessageTransportLike
): boolean {
  if (methodMessage.hasId) {
    sendError(
      transport,
      ErrorCode.InvalidRequest,
      INIT_FIRST_ERROR_MESSAGE,
      methodMessage.id
    );
  }
  return true;
}

function createInitGuardHandler(
  state: { sawInitialize: boolean; pendingInitIds: Set<string> },
  originalOnMessage: (message: unknown, extra?: unknown) => void,
  transport: StdioMessageTransportLike
): (message: unknown, extra?: unknown) => void {
  return (message: unknown, extra?: unknown) => {
    const methodMessage = parseJsonRpcMethodMessage(message);
    if (!methodMessage) {
      originalOnMessage(message, extra);
      return;
    }

    if (methodMessage.method === 'initialize') {
      if (!methodMessage.hasId) return;
      handleInitializeMethod(
        methodMessage,
        state,
        originalOnMessage,
        message,
        extra
      );
      return;
    }

    if (!state.sawInitialize) {
      handleNonInitializedRequest(methodMessage, transport);
      return;
    }

    originalOnMessage(message, extra);
  };
}

export function installStdioInitializationGuards(transport: unknown): void {
  if (!isStdioMessageTransport(transport)) return;

  const originalOnMessage = transport.onmessage;
  if (!originalOnMessage) return;

  const state = {
    sawInitialize: false,
    pendingInitIds: new Set<string>(),
  };

  wrapSendForInitTracking(transport, state);

  transport.onmessage = createInitGuardHandler(
    state,
    originalOnMessage,
    transport
  );
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
