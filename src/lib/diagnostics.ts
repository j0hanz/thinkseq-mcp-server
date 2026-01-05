import diagnostics_channel from 'node:diagnostics_channel';

export type LogFormat = 'pretty' | 'json';

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

const toolChannel = diagnostics_channel.channel('thinkseq:tool');
const lifecycleChannel = diagnostics_channel.channel('thinkseq:lifecycle');

function redactObject(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    const lower = key.toLowerCase();
    if (lower.includes('token') || lower.includes('authorization')) {
      out[key] = '[redacted]';
      continue;
    }
    out[key] = value;
  }
  return out;
}

function toSafeLogObject(message: unknown): Record<string, unknown> | null {
  if (typeof message !== 'object' || message === null) return null;

  const obj = message as Record<string, unknown>;

  // Keep it bounded: avoid very large strings.
  const bounded: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string') {
      bounded[k] = v.length > 500 ? `${v.slice(0, 500)}…` : v;
    } else {
      bounded[k] = v;
    }
  }

  return redactObject(bounded);
}

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

export function enableStderrSubscriber(logFormat: LogFormat): void {
  const handler = (message: unknown, name: string | symbol): void => {
    try {
      const obj = toSafeLogObject(message);
      if (!obj) return;

      if (logFormat === 'json') {
        console.error(JSON.stringify({ channel: String(name), ...obj }));
        return;
      }

      const type = typeof obj.type === 'string' ? obj.type : 'event';
      console.error(`[${String(name)}] ${type}`, obj);
    } catch {
      // Never throw from diagnostics subscribers.
    }
  };

  diagnostics_channel.subscribe('thinkseq:tool', handler);
  diagnostics_channel.subscribe('thinkseq:lifecycle', handler);
}
