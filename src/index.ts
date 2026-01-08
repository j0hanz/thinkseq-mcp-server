#!/usr/bin/env node
import { installProcessErrorHandlers, run } from './app.js';
import { ThinkingEngine } from './engine.js';
import type { ThinkingEngineOptions } from './engine.js';
import { getCliHelpText, parseCliConfig } from './lib/cli.js';

installProcessErrorHandlers();

const fatal = (err: unknown): void => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`thinkseq: fatal: ${message}`);
  process.exit(1);
};

const printHelpAndExit = (): never => {
  console.log(getCliHelpText());
  process.exit(0);
};

const buildEngineOptions = (config: {
  maxThoughts?: number;
  maxMemoryBytes?: number;
}): ThinkingEngineOptions => {
  const options: ThinkingEngineOptions = {};
  if (config.maxThoughts !== undefined) options.maxThoughts = config.maxThoughts;
  if (config.maxMemoryBytes !== undefined)
    options.maxMemoryBytes = config.maxMemoryBytes;
  return options;
};

const main = async (): Promise<void> => {
  try {
    const { config, help } = parseCliConfig();
    if (help) printHelpAndExit();

    const engineOptions = buildEngineOptions(config);
    const runDeps = {
      ...(config.packageReadTimeoutMs !== undefined && {
        packageReadTimeoutMs: config.packageReadTimeoutMs,
      }),
      ...(config.shutdownTimeoutMs !== undefined && {
        shutdownTimeoutMs: config.shutdownTimeoutMs,
      }),
      engineFactory: () => new ThinkingEngine(engineOptions),
    };

    await run(runDeps);
  } catch (err) {
    fatal(err);
  }
};

void main();
