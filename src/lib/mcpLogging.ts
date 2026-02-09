import diagnosticsChannel from 'node:diagnostics_channel';
import { format } from 'node:util';

import type { LoggingMessageNotificationParams } from '@modelcontextprotocol/sdk/types.js';

import type { LifecycleEvent, ToolEvent } from './diagnostics.js';

export interface LoggingTarget {
  sendLoggingMessage: (
    params: LoggingMessageNotificationParams,
    sessionId?: string
  ) => Promise<void>;
}

const TOOL_LOGGER = 'thinkseq.tool';
const LIFECYCLE_LOGGER = 'thinkseq.lifecycle';

const toolChannel = diagnosticsChannel.channel('thinkseq:tool');
const lifecycleChannel = diagnosticsChannel.channel('thinkseq:lifecycle');

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isToolEvent(value: unknown): value is ToolEvent {
  if (!isRecord(value)) return false;
  const { type } = value;
  if (type !== 'tool.start' && type !== 'tool.end') return false;
  return value.tool === 'thinkseq';
}

function isLifecycleEvent(value: unknown): value is LifecycleEvent {
  if (!isRecord(value)) return false;
  return (
    value.type === 'lifecycle.started' || value.type === 'lifecycle.shutdown'
  );
}

function sendLog(
  target: LoggingTarget,
  params: LoggingMessageNotificationParams
): void {
  void target.sendLoggingMessage(params).catch(() => {
    return;
  });
}

function toolEventToLog(event: ToolEvent): LoggingMessageNotificationParams {
  const level = event.type === 'tool.end' && !event.ok ? 'error' : 'info';
  return {
    level,
    logger: TOOL_LOGGER,
    data: event,
  };
}

function lifecycleEventToLog(
  event: LifecycleEvent
): LoggingMessageNotificationParams {
  const level = event.type === 'lifecycle.shutdown' ? 'notice' : 'info';
  return {
    level,
    logger: LIFECYCLE_LOGGER,
    data: event,
  };
}

export function installMcpLogging(target: LoggingTarget): () => void {
  const onTool = (event: unknown): void => {
    if (!isToolEvent(event)) return;
    sendLog(target, toolEventToLog(event));
  };
  const onLifecycle = (event: unknown): void => {
    if (!isLifecycleEvent(event)) return;
    sendLog(target, lifecycleEventToLog(event));
  };

  toolChannel.subscribe(onTool);
  lifecycleChannel.subscribe(onLifecycle);

  return () => {
    toolChannel.unsubscribe(onTool);
    lifecycleChannel.unsubscribe(onLifecycle);
  };
}

function createConsoleSender(
  target: LoggingTarget,
  level: LoggingMessageNotificationParams['level']
): (text: string) => void {
  return (text: string) => {
    void target
      .sendLoggingMessage({ level, logger: 'console', data: text })
      .catch(() => undefined);
  };
}

export function installConsoleBridge(target: LoggingTarget): {
  flush: () => void;
  restore: () => void;
} {
  const buffer: { level: 'info' | 'warning'; text: string }[] = [];
  let isReady = false;
  const sendInfo = createConsoleSender(target, 'info');
  const sendWarn = createConsoleSender(target, 'warning');

  const originalLog = console.log;
  const originalWarn = console.warn;

  console.log = (...args: unknown[]) => {
    const text = format(...args);
    if (isReady) {
      sendInfo(text);
    } else {
      buffer.push({ level: 'info', text });
    }
  };

  console.warn = (...args: unknown[]) => {
    const text = format(...args);
    if (isReady) {
      sendWarn(text);
    } else {
      buffer.push({ level: 'warning', text });
    }
  };

  return {
    flush: () => {
      isReady = true;
      buffer.forEach((item) => {
        if (item.level === 'info') sendInfo(item.text);
        else sendWarn(item.text);
      });
      buffer.length = 0;
    },
    restore: () => {
      console.log = originalLog;
      console.warn = originalWarn;
    },
  };
}
