#!/usr/bin/env node
import process from 'node:process';

import { installProcessErrorHandlers, run } from './app.js';
import type { RunDependencies } from './appConfig/runDependencies.js';
import { ThinkingEngine } from './engine.js';
import type { ThinkingEngineOptions } from './engine.js';
import { getCliHelpText, parseCliConfig } from './lib/cli.js';

installProcessErrorHandlers();

type CliConfig = ReturnType<typeof parseCliConfig>['config'];

const fatal = (err: unknown): never => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`thinkseq: fatal: ${message}`);
  process.exit(1);
};

const printHelpAndExit = (): never => {
  console.error(getCliHelpText());
  process.exit(0);
};

const buildEngineOptions = (config: {
  maxThoughts?: number;
  maxMemoryBytes?: number;
}): ThinkingEngineOptions => {
  const options: ThinkingEngineOptions = {};
  if (config.maxThoughts !== undefined)
    options.maxThoughts = config.maxThoughts;
  if (config.maxMemoryBytes !== undefined)
    options.maxMemoryBytes = config.maxMemoryBytes;
  return options;
};

const buildRunDependencies = (config: CliConfig): RunDependencies => {
  const engineOptions = buildEngineOptions(config);
  return {
    ...(config.packageReadTimeoutMs !== undefined && {
      packageReadTimeoutMs: config.packageReadTimeoutMs,
    }),
    ...(config.shutdownTimeoutMs !== undefined && {
      shutdownTimeoutMs: config.shutdownTimeoutMs,
    }),
    engineFactory: () => new ThinkingEngine(engineOptions),
  };
};

const runCli = async (): Promise<void> => {
  const { config, help } = parseCliConfig();
  if (help) printHelpAndExit();
  await run(buildRunDependencies(config));
};

void runCli().catch(fatal);
