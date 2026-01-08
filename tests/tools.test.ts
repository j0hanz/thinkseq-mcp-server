import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { ThinkingEngine } from '../src/engine.js';
import type { ErrorResponse } from '../src/lib/errors.js';
import type { ThoughtData } from '../src/lib/types.js';
import type { ProcessResult } from '../src/lib/types.js';
import { ThinkSeqInputSchema } from '../src/schemas/inputs.js';
import { ThinkSeqOutputSchema } from '../src/schemas/outputs.js';
import { registerThinkSeq } from '../src/tools/thinkseq.js';
import { captureDiagnostics } from './helpers/diagnostics.js';

type StructuredResponse = ProcessResult | ErrorResponse['structuredContent'];
type ToolRegistrar = Parameters<typeof registerThinkSeq>[0];

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

class FakeServer implements ToolRegistrar {
  public registered: RegisteredTool | null = null;

  registerTool: ToolRegistrar['registerTool'] = (
    name: string,
    definition: unknown,
    handler: RegisteredTool['handler']
  ) => {
    this.registered = { name, definition, handler };
  };
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
      processThought: () => buildSuccessResult(),
    } satisfies Pick<ThinkingEngine, 'processThought'>;

    registerThinkSeq(server, engine);

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
      processThought: (input: ThoughtData): ProcessResult =>
        buildSuccessResult({
          thoughtNumber: input.thoughtNumber,
          totalThoughts: input.totalThoughts,
          progress: input.thoughtNumber / input.totalThoughts,
          nextThoughtNeeded: input.nextThoughtNeeded,
        }),
    };

    registerThinkSeq(server, engine);
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

void describe('tools.registerThinkSeq optional fields', () => {
  void it('passes context and branch fields through', async () => {
    const server = new FakeServer();
    let seen: ThoughtData | undefined;
    const engine = {
      processThought: (input: ThoughtData): ProcessResult => {
        seen = input;
        return buildSuccessResult({
          thoughtNumber: input.thoughtNumber,
          totalThoughts: input.totalThoughts,
          progress: input.thoughtNumber / input.totalThoughts,
          nextThoughtNeeded: input.nextThoughtNeeded,
        });
      },
    };

    registerThinkSeq(server, engine);
    assert.ok(server.registered);

    const response = await server.registered.handler({
      ...createThoughtInput(),
      isRevision: true,
      revisesThought: 1,
      branchFromThought: 1,
      branchId: 'branch-a',
      thoughtType: 'analysis',
    });

    assert.ok(seen);
    assert.equal(seen.isRevision, true);
    assert.equal(seen.revisesThought, 1);
    assert.equal(seen.branchFromThought, 1);
    assert.equal(seen.branchId, 'branch-a');
    assert.equal(seen.thoughtType, 'analysis');
    assert.equal(response.structuredContent.ok, true);
  });
});

void describe('tools.registerThinkSeq diagnostics durationMs (success)', () => {
  void it('publishes durationMs on success', async (t) => {
    const { messages } = captureDiagnostics(t, 'thinkseq:tool');

    const handler = registerThinkSeqForTests(createOkEngine());
    await handler(createThoughtInput());

    assertToolMessagesHaveDurationSuccess(messages);
  });
});

void describe('tools.registerThinkSeq diagnostics context', () => {
  void it('publishes request context on start/end', async (t) => {
    const { messages } = captureDiagnostics(t, 'thinkseq:tool');

    const handler = registerThinkSeqForTests(createOkEngine());
    await handler(createThoughtInput());

    assertToolMessagesHaveContext(messages);
  });
});

void describe('tools.registerThinkSeq diagnostics durationMs (error)', () => {
  void it('publishes durationMs on error', async (t) => {
    const { messages } = captureDiagnostics(t, 'thinkseq:tool');

    const handler = registerThinkSeqForTests(createThrowingEngine());
    await handler(createThoughtInput());

    assertToolMessagesHaveDurationError(messages);
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

    registerThinkSeq(server, engine);
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

function getMessageRecord(message: unknown): Record<string, unknown> {
  assert.ok(isRecord(message));
  return message;
}

function buildSuccessResult(
  overrides: Partial<ProcessResult['result']> = {}
): ProcessResult {
  return {
    ok: true,
    result: {
      thoughtNumber: 1,
      totalThoughts: 1,
      progress: 1,
      nextThoughtNeeded: false,
      thoughtHistoryLength: 1,
      branches: [],
      context: { recentThoughts: [], hasRevisions: false },
      ...overrides,
    },
  };
}

function createOkEngine(): Pick<ThinkingEngine, 'processThought'> {
  return {
    processThought: (): ProcessResult => buildSuccessResult(),
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
  registerThinkSeq(server, engine);
  assert.ok(server.registered);
  return server.registered.handler;
}

function assertToolMessagesHaveDurationSuccess(messages: unknown[]): void {
  assert.equal(messages.length, 2);
  const start = getMessageRecord(messages[0]);
  const end = getMessageRecord(messages[1]);

  assert.equal(start.type, 'tool.start');
  assert.equal(end.type, 'tool.end');
  assert.equal(end.ok, true);

  assert.ok(typeof end.durationMs === 'number');
  assert.ok(Number.isFinite(end.durationMs));
  assert.ok(end.durationMs >= 0);
}

function assertToolMessagesHaveDurationError(messages: unknown[]): void {
  assert.equal(messages.length, 2);
  const start = getMessageRecord(messages[0]);
  const end = getMessageRecord(messages[1]);

  assert.equal(start.type, 'tool.start');
  assert.equal(end.type, 'tool.end');
  assert.equal(end.ok, false);
  assert.equal(end.errorCode, 'E_THINK');
  assert.ok(typeof end.errorMessage === 'string');
  assert.ok(end.errorMessage.length > 0);

  assert.ok(typeof end.durationMs === 'number');
  assert.ok(Number.isFinite(end.durationMs));
  assert.ok(end.durationMs >= 0);
}

function assertToolMessagesHaveContext(messages: unknown[]): void {
  assert.equal(messages.length, 2);
  const start = getMessageRecord(messages[0]);
  const end = getMessageRecord(messages[1]);
  const startContext = getContextRecord(start);
  const endContext = getContextRecord(end);

  assert.equal(start.type, 'tool.start');
  assert.equal(end.type, 'tool.end');

  assert.equal(startContext.requestId, endContext.requestId);
  assert.equal(startContext.startedAt, endContext.startedAt);
}

function getContextRecord(
  message: Record<string, unknown>
): Record<string, unknown> {
  const context = message.context;
  assert.ok(isRecord(context));
  assert.equal(typeof context.requestId, 'string');
  assert.ok(context.requestId.length > 0);
  assert.equal(typeof context.startedAt, 'number');
  assert.ok(Number.isFinite(context.startedAt));
  return context;
}
