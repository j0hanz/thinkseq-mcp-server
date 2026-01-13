import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface PackageInfo {
  name?: string;
  version?: string;
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
const defaultPackageJsonPath = fileURLToPath(
  new URL('../../package.json', import.meta.url)
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readStringProp(
  record: Record<string, unknown>,
  key: 'name' | 'version'
): string | undefined {
  const value = record[key];
  return typeof value === 'string' ? value : undefined;
}

function buildPackageInfo(parsed: Record<string, unknown>): PackageInfo {
  const name = readStringProp(parsed, 'name');
  const version = readStringProp(parsed, 'version');

  return {
    ...(name !== undefined ? { name } : {}),
    ...(version !== undefined ? { version } : {}),
  };
}

function parsePackageJson(raw: string): PackageInfo {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return {};
    return buildPackageInfo(parsed);
  } catch {
    return {};
  }
}

function resolvePackageJsonPath(deps?: PackageJsonDependencies): string {
  // Only honor cwd injection when readFile is also injected (test seam).
  if (deps?.readFile && deps.cwd) return join(deps.cwd(), 'package.json');
  return defaultPackageJsonPath;
}

export async function readSelfPackageJson(
  signal?: AbortSignal,
  deps?: PackageJsonDependencies
): Promise<PackageInfo> {
  try {
    const readFileImpl = deps?.readFile ?? defaultReadFile;
    const raw = await readFileImpl(
      resolvePackageJsonPath(deps),
      signal ? { encoding: 'utf8', signal } : { encoding: 'utf8' }
    );
    return parsePackageJson(raw);
  } catch {
    return {};
  }
}
