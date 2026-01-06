#!/usr/bin/env node
import { installProcessErrorHandlers, run } from './app.js';

// Process error handlers - must be registered early
installProcessErrorHandlers();

run().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`thinkseq: fatal: ${message}`);
  process.exit(1);
});
