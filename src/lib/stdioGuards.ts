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

function sendInvalidRequest(transport: StdioMessageTransportLike): void {
  const sendPromise = transport.send?.({
    jsonrpc: '2.0',
    id: null,
    error: {
      code: ErrorCode.InvalidRequest,
      message: 'Invalid Request',
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

function isParseOrSchemaError(error: unknown): boolean {
  return (
    error instanceof SyntaxError ||
    (error instanceof Error && error.name === 'ZodError')
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

    if (!isParseOrSchemaError(error)) return;

    sendInvalidRequest(transport);
  };
}
