import { parseArgs, type ParseArgsConfig } from 'node:util';

interface CliConfig {
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

type ParsedValues = ReturnType<typeof parseArgs<typeof PARSE_CONFIG>>['values'];
const BYTES_PER_MB = 1024 * 1024;

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
    return parseArgs({ ...PARSE_CONFIG, args }).values;
  }
  return parseArgs(PARSE_CONFIG).values;
}

function getStringOption(
  values: ParsedValues,
  key: keyof ParsedValues
): string | undefined {
  const value = values[key];
  return typeof value === 'string' ? value : undefined;
}

function buildCliConfig(values: ParsedValues): CliConfig {
  const maxThoughts = parsePositiveInt(
    getStringOption(values, 'max-thoughts'),
    'max-thoughts'
  );
  const maxMemoryMb = parsePositiveInt(
    getStringOption(values, 'max-memory-mb'),
    'max-memory-mb'
  );
  const shutdownTimeoutMs = parsePositiveInt(
    getStringOption(values, 'shutdown-timeout-ms'),
    'shutdown-timeout-ms'
  );
  const packageReadTimeoutMs = parsePositiveInt(
    getStringOption(values, 'package-read-timeout-ms'),
    'package-read-timeout-ms'
  );

  const config: CliConfig = {};
  if (maxThoughts !== undefined) config.maxThoughts = maxThoughts;
  if (maxMemoryMb !== undefined) {
    config.maxMemoryBytes = maxMemoryMb * BYTES_PER_MB;
  }
  if (shutdownTimeoutMs !== undefined) {
    config.shutdownTimeoutMs = shutdownTimeoutMs;
  }
  if (packageReadTimeoutMs !== undefined) {
    config.packageReadTimeoutMs = packageReadTimeoutMs;
  }

  return config;
}

export function getCliHelpText(): string {
  return HELP_TEXT;
}

export function parseCliConfig(args?: readonly string[]): CliParseResult {
  const values = getParsedValues(args);
  return {
    help: values.help === true,
    config: buildCliConfig(values),
  };
}
