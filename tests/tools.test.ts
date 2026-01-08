import assert from 'node:assert/strict';
import diagnostics_channel from 'node:diagnostics_channel';
import { describe, it } from 'node:test';
import type { TestContext } from 'node:test';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { ThinkingEngine } from '../src/engine.js';
import type { ErrorResponse } from '../src/lib/errors.js';
import type { ThoughtData } from '../src/lib/types.js';
import type { ProcessResult } from '../src/lib/types.js';
import { ThinkSeqInputSchema } from '../src/schemas/inputs.js';
import { ThinkSeqOutputSchema } from '../src/schemas/outputs.js';
import { registerThinkSeq } from '../src/tools/thinkseq.js';

type StructuredResponse = ProcessResult | ErrorResponse['structuredContent'];

interface RegisteredTool {
  name: string;
  definition: unknown;
  handler: (input: ThoughtData) =>
    | {
        content: { type: 'text'; text: string }[];
        structuredContent: StructuredResponse;
        isError?: boolean;
      }
    | Promise<{
        content: { type: 'text'; text: string }[];
        structuredContent: StructuredResponse;
        isError?: boolean;
      }>;
}

class FakeServer {
  public registered: RegisteredTool | null = null;

  registerTool(
    name: string,
    definition: unknown,
    handler: RegisteredTool['handler']
  ): void {
    this.registered = { name, definition, handler };
  }
}

const createThoughtInput = (): ThoughtData => ({
  thought: 'Hello',
  thoughtNumber: 1,
  totalThoughts: 2,
  nextThoughtNeeded: true,
});

void describe('tools.registerThinkSeq metadata', () => {
  void it('registers tool metadata and schemas', () => {
    const server = new FakeServer();
    const engine = {
      processThought: () => ({
        ok: true,
        result: {
          thoughtNumber: 1,
          totalThoughts: 1,
          progress: 1,
          nextThoughtNeeded: false,
          thoughtHistoryLength: 1,
          branches: [],
          context: { recentThoughts: [], hasRevisions: false },
        },
      }),
    } satisfies Pick<ThinkingEngine, 'processThought'>;

    registerThinkSeq(server as unknown as McpServer, engine);

    assert.ok(server.registered);
    assert.equal(server.registered.name, 'thinkseq');
    const definition = server.registered.definition;
    assert.ok(isRecord(definition));
    assert.equal(definition.title, 'Think Sequentially');
    assert.equal(definition.inputSchema, ThinkSeqInputSchema);
    assert.equal(definition.outputSchema, ThinkSeqOutputSchema);
  });
});

void describe('tools.registerThinkSeq handler success', () => {
  void it('returns a tool response on success', async () => {
    const server = new FakeServer();
    const engine = {
      processThought: (input: ThoughtData): ProcessResult => ({
        ok: true,
        result: {
          thoughtNumber: input.thoughtNumber,
          totalThoughts: input.totalThoughts,
          progress: input.thoughtNumber / input.totalThoughts,
          nextThoughtNeeded: input.nextThoughtNeeded,
          thoughtHistoryLength: 1,
          branches: [],
          context: { recentThoughts: [], hasRevisions: false },
        },
      }),
    };

    registerThinkSeq(server as unknown as McpServer, engine);
    assert.ok(server.registered);

    const input = createThoughtInput();
    const response = await server.registered.handler(input);

    assert.deepEqual(response.structuredContent.ok, true);
    assert.equal(response.isError, undefined);
    assert.equal(
      response.content[0].text,
      JSON.stringify(response.structuredContent)
    );
  });
});

void describe('tools.registerThinkSeq diagnostics durationMs (success)', () => {
  void it('publishes durationMs on success', async (t) => {
    const { messages } = captureDiagnostics(t, 'thinkseq:tool');

    const handler = registerThinkSeqForTests(createOkEngine());
    await handler(createThoughtInput());

    assertToolMessagesHaveDuration(messages, true);
  });
});

void describe('tools.registerThinkSeq diagnostics durationMs (error)', () => {
  void it('publishes durationMs on error', async (t) => {
    const { messages } = captureDiagnostics(t, 'thinkseq:tool');

    const handler = registerThinkSeqForTests(createThrowingEngine());
    await handler(createThoughtInput());

    assertToolMessagesHaveDuration(messages, false);
  });
});

void describe('tools.registerThinkSeq handler error', () => {
  void it('returns an error response on failure', async () => {
    const server = new FakeServer();
    const engine = {
      processThought: () => {
        throw new Error('boom');
      },
    };

    registerThinkSeq(server as unknown as McpServer, engine);
    assert.ok(server.registered);

    const input = createThoughtInput();

    const response = await server.registered.handler(input);
    assert.equal(response.isError, true);
    assert.deepEqual(response.structuredContent.ok, false);
    assert.deepEqual(response.structuredContent.error.code, 'E_THINK');
  });
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

interface DiagnosticsCapture {
  messages: unknown[];
}

function captureDiagnostics(
  t: TestContext,
  channel: string
): DiagnosticsCapture {
  const messages: unknown[] = [];
  const handler = (message: unknown): void => {
    messages.push(message);
  };

  diagnostics_channel.subscribe(channel, handler);
  t.after(() => diagnostics_channel.unsubscribe(channel, handler));

  return { messages };
}

function getMessageRecord(message: unknown): Record<string, unknown> {
  assert.ok(isRecord(message));
  return message;
}

function createOkEngine(): Pick<ThinkingEngine, 'processThought'> {
  return {
    processThought: (): ProcessResult => ({
      ok: true,
      result: {
        thoughtNumber: 1,
        totalThoughts: 1,
        progress: 1,
        nextThoughtNeeded: false,
        thoughtHistoryLength: 1,
        branches: [],
        context: { recentThoughts: [], hasRevisions: false },
      },
    }),
  };
}

function createThrowingEngine(): Pick<ThinkingEngine, 'processThought'> {
  return {
    processThought: (): ProcessResult => {
      throw new Error('boom');
    },
  };
}

function registerThinkSeqForTests(
  engine: Pick<ThinkingEngine, 'processThought'>
): RegisteredTool['handler'] {
  const server = new FakeServer();
  registerThinkSeq(server as unknown as McpServer, engine);
  assert.ok(server.registered);
  return server.registered.handler;
}

function assertToolMessagesHaveDuration(
  messages: unknown[],
  ok: boolean
): void {
  assert.equal(messages.length, 2);
  const start = getMessageRecord(messages[0]);
  const end = getMessageRecord(messages[1]);

  assert.equal(start.type, 'tool.start');
  assert.equal(end.type, 'tool.end');
  assert.equal(end.ok, ok);

  if (!ok) {
    assert.equal(end.errorCode, 'E_THINK');
    assert.ok(typeof end.errorMessage === 'string');
    assert.ok(end.errorMessage.length > 0);
  }

  assert.ok(typeof end.durationMs === 'number');
  assert.ok(Number.isFinite(end.durationMs));
  assert.ok(end.durationMs >= 0);
}
