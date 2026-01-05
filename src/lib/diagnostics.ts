import diagnostics_channel from 'node:diagnostics_channel';

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

const toolChannel = diagnostics_channel.channel('thinkseq:tool');
const lifecycleChannel = diagnostics_channel.channel('thinkseq:lifecycle');
const engineChannel = diagnostics_channel.channel('thinkseq:engine');

export function publishToolEvent(event: ToolEvent): void {
  if (!toolChannel.hasSubscribers) return;
  try {
    toolChannel.publish(event);
  } catch {
    // Never throw from diagnostics publish.
  }
}

export function publishLifecycleEvent(event: LifecycleEvent): void {
  if (!lifecycleChannel.hasSubscribers) return;
  try {
    lifecycleChannel.publish(event);
  } catch {
    // Never throw from diagnostics publish.
  }
}

export function publishEngineEvent(event: EngineEvent): void {
  if (!engineChannel.hasSubscribers) return;
  try {
    engineChannel.publish(event);
  } catch {
    // Never throw from diagnostics publish.
  }
}
