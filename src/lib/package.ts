import { readFile } from 'node:fs/promises';

export interface PackageInfo {
  name?: string | undefined;
  version?: string | undefined;
}

export interface PackageJsonDependencies {
  readFile?: typeof readFile;
  nodeModule?: NodeModuleFacade;
  loadNodeModule?: () => Promise<NodeModuleFacade>;
  disableCache?: boolean;
}

interface NodeModuleFacade {
  findPackageJSON?: (specifier: string, base?: string) => string | undefined;
  createRequire: (url: string) => (id: string) => unknown;
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

async function readPackageJsonViaFind(
  nodeModule: NodeModuleFacade,
  readFileImpl: typeof readFile,
  signal?: AbortSignal
): Promise<PackageInfo | undefined> {
  if (typeof nodeModule.findPackageJSON !== 'function') return undefined;
  const packageJsonPath = nodeModule.findPackageJSON('.', import.meta.url);
  if (!packageJsonPath) return undefined;

  const raw = await readFileImpl(packageJsonPath, {
    encoding: 'utf8',
    signal: getEffectiveSignal(signal),
  });
  return parsePackageJson(raw);
}

function readPackageJsonViaRequire(nodeModule: NodeModuleFacade): PackageInfo {
  const req = nodeModule.createRequire(import.meta.url);
  const pkg = req('../package.json');

  if (typeof pkg !== 'object' || pkg === null) return {};
  const obj = pkg as Record<string, unknown>;

  return {
    name: typeof obj.name === 'string' ? obj.name : undefined,
    version: typeof obj.version === 'string' ? obj.version : undefined,
  };
}

export async function readSelfPackageJson(
  signal?: AbortSignal,
  deps?: PackageJsonDependencies
): Promise<PackageInfo> {
  if (deps?.disableCache) {
    return loadPackageInfoWithDeps(signal, deps);
  }
  cached ??= loadPackageInfoWithDeps(signal, deps);
  try {
    return await cached;
  } catch (err) {
    cached = undefined;
    throw err;
  }
}

export function resetPackageJsonCache(): void {
  cached = undefined;
}

async function resolveNodeModule(
  deps?: PackageJsonDependencies
): Promise<NodeModuleFacade> {
  if (deps?.nodeModule) return deps.nodeModule;
  if (deps?.loadNodeModule) return deps.loadNodeModule();
  return (await import('node:module')) as NodeModuleFacade;
}

async function loadPackageInfoWithDeps(
  signal?: AbortSignal,
  deps?: PackageJsonDependencies
): Promise<PackageInfo> {
  const nodeModule = await resolveNodeModule(deps);
  const readFileImpl = deps?.readFile ?? readFile;
  const viaFind = await readPackageJsonViaFind(
    nodeModule,
    readFileImpl,
    signal
  );
  if (viaFind !== undefined) return viaFind;
  return readPackageJsonViaRequire(nodeModule);
}
