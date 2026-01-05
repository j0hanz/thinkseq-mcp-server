import { readFile } from 'node:fs/promises';

export interface PackageInfo {
  name?: string | undefined;
  version?: string | undefined;
}

const PACKAGE_JSON_TIMEOUT_MS = 2000;

let cached: Promise<PackageInfo> | undefined;

function parsePackageJson(raw: string): PackageInfo {
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== 'object' || parsed === null) return {};

  const obj = parsed as Record<string, unknown>;
  return {
    name: typeof obj.name === 'string' ? obj.name : undefined,
    version: typeof obj.version === 'string' ? obj.version : undefined,
  };
}

function getEffectiveSignal(signal?: AbortSignal): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(PACKAGE_JSON_TIMEOUT_MS);
  if (!signal) return timeoutSignal;
  return AbortSignal.any([signal, timeoutSignal]);
}

export async function readSelfPackageJson(
  signal?: AbortSignal
): Promise<PackageInfo> {
  if (cached) {
    return cached;
  }

  const promise = (async (): Promise<PackageInfo> => {
    const nodeModule = await import('node:module');

    const maybeFind = (nodeModule as unknown as { findPackageJSON?: unknown })
      .findPackageJSON;

    if (typeof maybeFind === 'function') {
      const findPackageJSON = maybeFind as (
        specifier: string,
        base?: string
      ) => string | undefined;

      const packageJsonPath = findPackageJSON('.', import.meta.url);
      if (!packageJsonPath) return {};

      const raw = await readFile(packageJsonPath, {
        encoding: 'utf8',
        signal: getEffectiveSignal(signal),
      });
      return parsePackageJson(raw);
    }

    // Fallback for older Node: use createRequire.
    const createRequire = (
      nodeModule as unknown as {
        createRequire: (url: string) => (id: string) => unknown;
      }
    ).createRequire;

    const req = createRequire(import.meta.url);
    const pkg = req('../package.json');

    if (typeof pkg !== 'object' || pkg === null) return {};
    const obj = pkg as Record<string, unknown>;

    return {
      name: typeof obj.name === 'string' ? obj.name : undefined,
      version: typeof obj.version === 'string' ? obj.version : undefined,
    };
  })();

  cached = promise;

  try {
    return await promise;
  } catch (err) {
    // Clear cache on failure so next call can retry
    cached = undefined;
    throw err;
  }
}
