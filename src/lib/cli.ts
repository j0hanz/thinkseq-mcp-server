import { parseArgs, type ParseArgsConfig } from 'node:util';

export interface CliConfig {
  maxThoughts?: number;
  maxMemoryBytes?: number;
  shutdownTimeoutMs?: number;
  packageReadTimeoutMs?: number;
}

export interface CliParseResult {
  config: CliConfig;
  help: boolean;
}

const PARSE_CONFIG = {
  options: {
    'max-thoughts': { type: 'string' },
    'max-memory-mb': { type: 'string' },
    'shutdown-timeout-ms': { type: 'string' },
    'package-read-timeout-ms': { type: 'string' },
    help: { type: 'boolean', short: 'h' },
  },
  strict: true,
  allowPositionals: false,
  allowNegative: false,
} as const satisfies ParseArgsConfig;

const HELP_TEXT = `Usage: thinkseq [options]

Options:
  --max-thoughts <number>          Max thoughts to keep in memory
  --max-memory-mb <number>         Max memory (MB) for stored thoughts
  --shutdown-timeout-ms <number>   Graceful shutdown timeout
  --package-read-timeout-ms <number>  Package.json read timeout
  -h, --help                       Show this help`;

type ParsedValues = Record<
  string,
  string | boolean | (string | boolean)[] | undefined
>;

function parsePositiveInt(
  value: string | undefined,
  label: string
): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
  return parsed;
}

function getParsedValues(args?: readonly string[]): ParsedValues {
  if (args) {
    return parseArgs({ ...PARSE_CONFIG, args }).values as ParsedValues;
  }
  return parseArgs(PARSE_CONFIG).values as ParsedValues;
}

export function getCliHelpText(): string {
  return HELP_TEXT;
}

export function parseCliConfig(args?: readonly string[]): CliParseResult {
  const values = getParsedValues(args);
  const maxThoughts = parsePositiveInt(
    typeof values['max-thoughts'] === 'string'
      ? values['max-thoughts']
      : undefined,
    'max-thoughts'
  );
  const maxMemoryMb = parsePositiveInt(
    typeof values['max-memory-mb'] === 'string'
      ? values['max-memory-mb']
      : undefined,
    'max-memory-mb'
  );
  const shutdownTimeoutMs = parsePositiveInt(
    typeof values['shutdown-timeout-ms'] === 'string'
      ? values['shutdown-timeout-ms']
      : undefined,
    'shutdown-timeout-ms'
  );
  const packageReadTimeoutMs = parsePositiveInt(
    typeof values['package-read-timeout-ms'] === 'string'
      ? values['package-read-timeout-ms']
      : undefined,
    'package-read-timeout-ms'
  );

  return {
    help: values.help === true,
    config: {
      ...(maxThoughts !== undefined ? { maxThoughts } : {}),
      ...(maxMemoryMb !== undefined
        ? { maxMemoryBytes: maxMemoryMb * 1024 * 1024 }
        : {}),
      ...(shutdownTimeoutMs !== undefined ? { shutdownTimeoutMs } : {}),
      ...(packageReadTimeoutMs !== undefined ? { packageReadTimeoutMs } : {}),
    },
  };
}
