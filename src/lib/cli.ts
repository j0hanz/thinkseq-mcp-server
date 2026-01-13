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

type CliOptionKey = Exclude<keyof typeof PARSE_CONFIG.options, 'help'>;

interface OptionSpec {
  key: CliOptionKey;
  configKey: keyof CliConfig;
  map?: (value: number) => number;
}

const CLI_OPTION_SPECS: readonly OptionSpec[] = [
  { key: 'max-thoughts', configKey: 'maxThoughts' },
  {
    key: 'max-memory-mb',
    configKey: 'maxMemoryBytes',
    map: (value: number) => value * BYTES_PER_MB,
  },
  { key: 'shutdown-timeout-ms', configKey: 'shutdownTimeoutMs' },
  { key: 'package-read-timeout-ms', configKey: 'packageReadTimeoutMs' },
];

function parsePositiveInt(
  value: string | undefined,
  label: string
): number | undefined {
  if (value === undefined) return undefined;
  if (!/^\d+$/.test(value)) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
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
  const config: CliConfig = {};
  for (const spec of CLI_OPTION_SPECS) {
    const raw = getStringOption(values, spec.key);
    const parsed = parsePositiveInt(raw, spec.key);
    if (parsed === undefined) continue;
    const mapped = spec.map ? spec.map(parsed) : parsed;
    config[spec.configKey] = mapped;
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
