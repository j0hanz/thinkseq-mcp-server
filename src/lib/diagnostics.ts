import diagnosticsChannel from 'node:diagnostics_channel';

import { getRequestContext } from './context.js';

interface EventContext {
  requestId: string;
  startedAt: number;
  startedAtEpochMs: number;
}

type ToolEventBase =
  | {
      type: 'tool.start';
      tool: 'thinkseq';
      ts: number;
    }
  | {
      type: 'tool.end';
      tool: 'thinkseq';
      ts: number;
      ok: true;
      durationMs?: number;
    }
  | {
      type: 'tool.end';
      tool: 'thinkseq';
      ts: number;
      ok: false;
      errorCode: string;
      errorMessage: string;
      durationMs?: number;
    };

export type ToolEvent = ToolEventBase & { context?: EventContext };

export type LifecycleEvent =
  | { type: 'lifecycle.started'; ts: number }
  | { type: 'lifecycle.shutdown'; ts: number; signal: string };

const toolChannel = diagnosticsChannel.channel('thinkseq:tool');
const lifecycleChannel = diagnosticsChannel.channel('thinkseq:lifecycle');

function safePublish(
  channel: diagnosticsChannel.Channel,
  message: unknown
): void {
  if (!channel.hasSubscribers) return;
  try {
    channel.publish(message);
  } catch {
    // Intentional suppression of publication errors
  }
}

function attachContext<T extends { context?: EventContext }>(event: T): T {
  const context = getRequestContext();
  if (!context) return event;
  return {
    ...event,
    context: {
      ...event.context,
      requestId: context.requestId,
      startedAt: context.startedAt,
      startedAtEpochMs: context.startedAtEpochMs,
    },
  };
}

export function publishToolEvent(event: ToolEvent): void {
  safePublish(toolChannel, attachContext(event));
}

export function publishLifecycleEvent(event: LifecycleEvent): void {
  safePublish(lifecycleChannel, event);
}
