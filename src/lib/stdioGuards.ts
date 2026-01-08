import { ErrorCode } from '@modelcontextprotocol/sdk/types.js';

interface StdioMessageTransportLike {
  onmessage?: (message: unknown, extra?: unknown) => void;
  send?: (message: unknown) => Promise<void>;
  onerror?: (error: unknown) => void;
}

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

function sendError(
  transport: StdioMessageTransportLike,
  code: number,
  message: string
): void {
  const sendPromise = transport.send?.({
    jsonrpc: '2.0',
    id: null,
    error: {
      code,
      message,
    },
  });
  sendPromise?.catch(() => {
    return;
  });
}

function sendInvalidRequest(transport: StdioMessageTransportLike): void {
  sendError(transport, ErrorCode.InvalidRequest, 'Invalid Request');
}

function sendParseError(transport: StdioMessageTransportLike): void {
  sendError(transport, ErrorCode.ParseError, 'Parse error');
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

export function installStdioInvalidMessageGuards(transport: unknown): void {
  if (!isStdioMessageTransport(transport)) return;

  const originalOnMessage = transport.onmessage;
  if (!originalOnMessage) return;

  transport.onmessage = (message: unknown, extra?: unknown) => {
    // MCP stdio is line-delimited JSON-RPC (one object per line). JSON-RPC
    // batching is removed in newer revisions; treat arrays as invalid.
    if (isInvalidJsonRpcMessageShape(message)) {
      sendInvalidRequest(transport);
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
      sendParseError(transport);
      return;
    }

    if (isSchemaError(error)) {
      sendInvalidRequest(transport);
    }
  };
}
