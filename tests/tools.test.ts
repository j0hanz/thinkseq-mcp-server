import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

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
  handler: (input: ThoughtData) => {
    content: { type: 'text'; text: string }[];
    structuredContent: StructuredResponse;
    isError?: boolean;
  };
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
  void it('returns a tool response on success', () => {
    const server = new FakeServer();
    const engine = {
      processThought: (input: ThoughtData): ProcessResult => ({
        ok: true,
        result: {
          thoughtNumber: input.thoughtNumber,
          totalThoughts: input.totalThoughts,
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

    const expected = engine.processThought(input);
    const response = server.registered.handler(input);
    assert.deepEqual(response.structuredContent, expected);
    assert.equal(response.isError, undefined);
    assert.equal(response.content[0].text, JSON.stringify(expected));
  });
});

void describe('tools.registerThinkSeq handler error', () => {
  void it('returns an error response on failure', () => {
    const server = new FakeServer();
    const engine = {
      processThought: () => {
        throw new Error('boom');
      },
    };

    registerThinkSeq(server as unknown as McpServer, engine);
    assert.ok(server.registered);

    const input = createThoughtInput();

    const response = server.registered.handler(input);
    assert.equal(response.isError, true);
    assert.deepEqual(response.structuredContent.ok, false);
    assert.deepEqual(response.structuredContent.error.code, 'E_THINK');
  });
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
