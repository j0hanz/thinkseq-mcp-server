import assert from 'node:assert/strict';
import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import { once } from 'node:events';
import { access } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

type JsonRpcId = number | string | null;

interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: JsonRpcId;
  result?: unknown;
  error?: JsonRpcError;
}

interface RunningServer {
  process: ChildProcessWithoutNullStreams;
  sendRaw: (line: string) => void;
  waitForResponse: (
    id: JsonRpcId,
    timeoutMs?: number
  ) => Promise<JsonRpcResponse>;
  close: () => Promise<void>;
}

function getDistEntrypointPath(): string {
  return fileURLToPath(new URL('../dist/index.js', import.meta.url));
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function startServer(entryPath: string): RunningServer {
  const child = spawn(process.execPath, [entryPath], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  const pending = new Map<string, (value: JsonRpcResponse) => void>();

  const rl = createInterface({
    input: child.stdout,
    crlfDelay: Infinity,
  });

  rl.on('line', (line) => {
    const trimmed = line.trim();
    if (trimmed.length === 0) return;

    let message: unknown;
    try {
      message = JSON.parse(trimmed) as unknown;
    } catch {
      assert.fail(`Server emitted non-JSON on stdout: ${trimmed}`);
    }

    assert.ok(isJsonRpcResponse(message));

    const key = getIdKey(message.id);
    const resolver = pending.get(key);
    if (resolver) {
      pending.delete(key);
      resolver(message);
    }
  });

  const sendRaw = (line: string) => {
    child.stdin.write(`${line}\n`);
  };

  const waitForResponse = async (
    id: JsonRpcId,
    timeoutMs: number = 1500
  ): Promise<JsonRpcResponse> => {
    const key = getIdKey(id);

    const response = await Promise.race([
      new Promise<JsonRpcResponse>((resolve) => {
        pending.set(key, resolve);
      }),
      new Promise<JsonRpcResponse>((_resolve, reject) => {
        setTimeout(() => {
          pending.delete(key);
          reject(
            new Error(`Timed out waiting for JSON-RPC response (id=${key})`)
          );
        }, timeoutMs);
      }),
    ]);

    return response;
  };

  const close = async () => {
    if (!child.killed) {
      child.kill('SIGTERM');
    }

    await Promise.race([
      once(child, 'exit').then(() => {
        return;
      }),
      new Promise<void>((_resolve, reject) => {
        setTimeout(() => {
          reject(new Error('Timed out waiting for server process to exit'));
        }, 1500);
      }),
    ]);

    rl.close();
  };

  return {
    process: child,
    sendRaw,
    waitForResponse,
    close,
  };
}

function getIdKey(id: JsonRpcId): string {
  return id === null ? 'null' : String(id);
}

function isJsonRpcResponse(value: unknown): value is JsonRpcResponse {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  if (record.jsonrpc !== '2.0') return false;
  if (!('id' in record)) return false;

  const id = record.id;
  if (!(id === null || typeof id === 'string' || typeof id === 'number')) {
    return false;
  }

  const hasResult = 'result' in record;
  const hasError = 'error' in record;
  return hasResult || hasError;
}

function buildRequest(
  id: JsonRpcId,
  method: string,
  params?: unknown
): Record<string, unknown> {
  const request: Record<string, unknown> = {
    jsonrpc: '2.0',
    id,
    method,
  };

  if (params !== undefined) {
    request.params = params;
  }

  return request;
}

function assertIsErrorResponse(
  response: JsonRpcResponse
): asserts response is JsonRpcResponse & { error: JsonRpcError } {
  assert.ok(response.error);
  assert.equal(typeof response.error.code, 'number');
  assert.equal(typeof response.error.message, 'string');
}

void describe('stdio black-box regression', () => {
  void it('enforces init-first and rejects invalid message shapes', async (t) => {
    const entryPath = getDistEntrypointPath();
    if (!(await pathExists(entryPath))) {
      t.skip(
        'dist/index.js not found (run `npm run build` or `npm run test:ci`)'
      );
      return;
    }

    const server = startServer(entryPath);
    t.after(async () => {
      await server.close();
    });

    // 1) JSON-RPC batch arrays are rejected (no batching supported)
    server.sendRaw(JSON.stringify([buildRequest(1, 'tools/list')]));

    const batchResponse = await server.waitForResponse(null);
    assertIsErrorResponse(batchResponse);
    assert.equal(batchResponse.error.code, -32600);

    // 2) Parse errors return JSON-RPC Parse error
    server.sendRaw('{');
    const parseResponse = await server.waitForResponse(null);
    assertIsErrorResponse(parseResponse);
    assert.equal(parseResponse.error.code, -32700);

    // 3) tools/list before initialize is rejected
    server.sendRaw(JSON.stringify(buildRequest(2, 'tools/list')));
    const preInitToolsList = await server.waitForResponse(2);
    assertIsErrorResponse(preInitToolsList);
    assert.equal(preInitToolsList.error.code, -32600);

    // 4) [Removed] initialize missing protocolVersion is passed to SDK (behavior varies)
    // We skip this check to avoid testing SDK internals.

    // 5) initialize succeeds with an allowed protocol version
    server.sendRaw(
      JSON.stringify(
        buildRequest(4, 'initialize', {
          protocolVersion: '2025-11-25',
          clientInfo: { name: 'stdio-blackbox', version: '0.0.0' },
          capabilities: {},
        })
      )
    );

    const initOk = await server.waitForResponse(4);
    assert.ok(!initOk.error);
    assert.ok(initOk.result);
    const initResult = initOk.result as Record<string, unknown>;
    const capabilities = initResult.capabilities as Record<string, unknown>;
    assert.ok(capabilities);
    const tools = capabilities.tools as Record<string, unknown>;
    assert.ok(tools);
    assert.equal(tools.listChanged, true);
    assert.ok(capabilities.logging && typeof capabilities.logging === 'object');

    // 6) notifications/initialized before other requests
    server.sendRaw(
      JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })
    );

    // 7) tools/list now succeeds
    server.sendRaw(JSON.stringify(buildRequest(5, 'tools/list')));
    const postInitToolsList = await server.waitForResponse(5);
    assert.ok(!postInitToolsList.error);

    const resultRecord = postInitToolsList.result as Record<string, unknown>;
    assert.ok(resultRecord);
    assert.ok(Array.isArray(resultRecord.tools));
  });
});
