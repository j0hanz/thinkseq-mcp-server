import { readFile } from 'node:fs/promises';

export interface PackageInfo {
  name?: string;
  version?: string;
}

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

export async function readSelfPackageJson(
  signal?: AbortSignal
): Promise<PackageInfo> {
  cached =
    cached ??
    (async () => {
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
          signal,
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

  return cached;
}
