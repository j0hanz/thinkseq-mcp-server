import diagnosticsChannel from 'node:diagnostics_channel';

export type ToolEvent =
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

export type LifecycleEvent =
  | { type: 'lifecycle.started'; ts: number }
  | { type: 'lifecycle.shutdown'; ts: number; signal: string };

export interface EngineEvent {
  type: 'engine.sequence_gap';
  ts: number;
  expected: number;
  received: number;
}

const toolChannel = diagnosticsChannel.channel('thinkseq:tool');
const lifecycleChannel = diagnosticsChannel.channel('thinkseq:lifecycle');
const engineChannel = diagnosticsChannel.channel('thinkseq:engine');

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

export function publishToolEvent(event: ToolEvent): void {
  safePublish(toolChannel, event);
}

export function publishLifecycleEvent(event: LifecycleEvent): void {
  safePublish(lifecycleChannel, event);
}

export function publishEngineEvent(event: EngineEvent): void {
  safePublish(engineChannel, event);
}
