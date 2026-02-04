import process from 'node:process';

const FALSY_ENV_VALUES = new Set(['0', 'false', 'no', 'off']);

function resolveIncludeTextContent(): boolean {
  const raw = process.env.THINKSEQ_INCLUDE_TEXT_CONTENT;
  return raw === undefined || !FALSY_ENV_VALUES.has(raw.trim().toLowerCase());
}

export const APP_ENV = {
  INCLUDE_TEXT_CONTENT: resolveIncludeTextContent(),
} as const;
