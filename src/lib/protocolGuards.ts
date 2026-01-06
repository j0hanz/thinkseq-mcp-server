import {
  ErrorCode,
  McpError,
  SUPPORTED_PROTOCOL_VERSIONS,
} from '@modelcontextprotocol/sdk/types.js';

type RequestHandler = (request: unknown, extra: unknown) => unknown;

const INIT_FIRST_ERROR_MESSAGE = 'initialize must be the first request';

function isRequestHandler(value: unknown): value is RequestHandler {
  return typeof value === 'function';
}

function getInitializeProtocolVersion(request: unknown): unknown {
  if (!request || typeof request !== 'object') return undefined;
  const params: unknown = Reflect.get(request, 'params');
  if (!params || typeof params !== 'object') return undefined;
  return Reflect.get(params, 'protocolVersion');
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

function getProtocolObject(server: unknown): object | undefined {
  if (!server || typeof server !== 'object') return undefined;
  const protocol: unknown = Reflect.get(server, 'server');
  return protocol && typeof protocol === 'object' ? protocol : undefined;
}

function getRequestHandlers(
  protocol: object
): Map<unknown, unknown> | undefined {
  const handlers: unknown = Reflect.get(protocol, '_requestHandlers');
  return handlers instanceof Map ? handlers : undefined;
}

function installFallbackRequestHandler(
  protocol: object,
  state: { sawInitialize: boolean }
): void {
  // Guard unknown methods as well (so pre-init calls to unknown methods don't
  // fall through to MethodNotFound).
  const handler = (request: unknown): never => {
    const method: unknown =
      request && typeof request === 'object'
        ? Reflect.get(request, 'method')
        : undefined;
    if (!state.sawInitialize && method !== 'initialize') {
      throw new McpError(ErrorCode.InvalidRequest, INIT_FIRST_ERROR_MESSAGE);
    }
    throw new McpError(ErrorCode.MethodNotFound, 'Method not found');
  };

  Reflect.set(protocol, 'fallbackRequestHandler', handler);
}

function wrapRequestHandlers(
  handlers: Map<unknown, unknown>,
  state: { sawInitialize: boolean }
): void {
  for (const [method, handler] of handlers.entries()) {
    if (typeof method !== 'string') continue;
    if (!isRequestHandler(handler)) continue;
    handlers.set(method, wrapWithInitializationGuard(method, handler, state));
  }
}

export function installInitializationGuards(server: unknown): void {
  const protocol = getProtocolObject(server);
  if (!protocol) return;
  const handlers = getRequestHandlers(protocol);
  if (!handlers) return;

  const state = { sawInitialize: false };

  wrapRequestHandlers(handlers, state);
  installFallbackRequestHandler(protocol, state);
}
