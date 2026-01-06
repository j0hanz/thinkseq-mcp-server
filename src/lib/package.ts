import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface PackageInfo {
  name?: string | undefined;
  version?: string | undefined;
}

type ReadFile = (
  path: string,
  options: { encoding: 'utf8'; signal?: AbortSignal }
) => Promise<string>;

export interface PackageJsonDependencies {
  readFile?: ReadFile;
  cwd?: () => string;
}

const defaultReadFile: ReadFile = (path, options) => readFile(path, options);
const defaultCwd = (): string => process.cwd();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parsePackageJson(raw: string): PackageInfo {
  const parsed: unknown = JSON.parse(raw);
  if (!isRecord(parsed)) return {};

  return {
    name: typeof parsed.name === 'string' ? parsed.name : undefined,
    version: typeof parsed.version === 'string' ? parsed.version : undefined,
  };
}

function resolveReadFile(deps?: PackageJsonDependencies): ReadFile {
  return deps?.readFile ?? defaultReadFile;
}

function resolveCwd(deps?: PackageJsonDependencies): () => string {
  return deps?.cwd ?? defaultCwd;
}

function buildReadOptions(signal?: AbortSignal): {
  encoding: 'utf8';
  signal?: AbortSignal;
} {
  return signal ? { encoding: 'utf8', signal } : { encoding: 'utf8' };
}

export async function readSelfPackageJson(
  signal?: AbortSignal,
  deps?: PackageJsonDependencies
): Promise<PackageInfo> {
  const readFileImpl = resolveReadFile(deps);
  const cwd = resolveCwd(deps);
  const raw = await readFileImpl(
    join(cwd(), 'package.json'),
    buildReadOptions(signal)
  );
  return parsePackageJson(raw);
}
