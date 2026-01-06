import {
  ErrorCode,
  McpError,
  SUPPORTED_PROTOCOL_VERSIONS,
} from '@modelcontextprotocol/sdk/types.js';

type RequestHandler = (request: unknown, extra: unknown) => unknown;

const INIT_FIRST_ERROR_MESSAGE = 'initialize must be the first request';

interface ProtocolLike {
  _requestHandlers?: unknown;
  fallbackRequestHandler?: unknown;
}

function isRequestHandler(value: unknown): value is RequestHandler {
  return typeof value === 'function';
}

function getInitializeProtocolVersion(request: unknown): unknown {
  return (request as { params?: { protocolVersion?: unknown } } | undefined)
    ?.params?.protocolVersion;
}

function assertSupportedProtocolVersion(protocolVersion: unknown): void {
  if (typeof protocolVersion !== 'string') return;
  if (SUPPORTED_PROTOCOL_VERSIONS.includes(protocolVersion)) return;
  throw new McpError(
    ErrorCode.InvalidRequest,
    `Unsupported protocolVersion: ${protocolVersion}`
  );
}

function wrapWithInitializationGuard(
  method: string,
  handler: RequestHandler,
  state: { sawInitialize: boolean }
): RequestHandler {
  if (method === 'initialize') {
    return async (request: unknown, extra: unknown): Promise<unknown> => {
      assertSupportedProtocolVersion(getInitializeProtocolVersion(request));
      state.sawInitialize = true;
      return await handler(request, extra);
    };
  }

  return async (request: unknown, extra: unknown): Promise<unknown> => {
    if (!state.sawInitialize) {
      throw new McpError(ErrorCode.InvalidRequest, INIT_FIRST_ERROR_MESSAGE);
    }
    return await handler(request, extra);
  };
}

function getProtocol(server: unknown): ProtocolLike | undefined {
  return (server as { server?: unknown } | undefined)?.server as
    | ProtocolLike
    | undefined;
}

function getRequestHandlers(
  protocol: ProtocolLike
): Map<string, unknown> | undefined {
  const handlers = protocol._requestHandlers;
  return handlers instanceof Map
    ? (handlers as Map<string, unknown>)
    : undefined;
}

function installFallbackRequestHandler(
  protocol: ProtocolLike,
  state: { sawInitialize: boolean }
): void {
  // Guard unknown methods as well (so pre-init calls to unknown methods don't
  // fall through to MethodNotFound).
  protocol.fallbackRequestHandler = (request: { method?: unknown }) => {
    const method = request.method;
    if (!state.sawInitialize && method !== 'initialize') {
      throw new McpError(ErrorCode.InvalidRequest, INIT_FIRST_ERROR_MESSAGE);
    }
    throw new McpError(ErrorCode.MethodNotFound, 'Method not found');
  };
}

export function installInitializationGuards(server: unknown): void {
  const protocol = getProtocol(server);
  if (!protocol) return;

  const handlers = getRequestHandlers(protocol);
  if (!handlers) return;

  const state = { sawInitialize: false };

  for (const [method, handler] of handlers.entries()) {
    if (!isRequestHandler(handler)) continue;
    handlers.set(method, wrapWithInitializationGuard(method, handler, state));
  }

  installFallbackRequestHandler(protocol, state);
}
