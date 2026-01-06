import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

import type { PackageJsonDependencies } from '../src/lib/package.js';
import {
  readSelfPackageJson,
  resetPackageJsonCache,
} from '../src/lib/package.js';

interface RawPkg {
  name?: unknown;
  version?: unknown;
}

void describe('package.readSelfPackageJson', () => {
  void it('returns name/version matching package.json', async () => {
    resetPackageJsonCache();
    const raw = await readFile(
      new URL('../package.json', import.meta.url),
      'utf8'
    );
    const parsed = JSON.parse(raw) as RawPkg;

    const expectedName =
      typeof parsed.name === 'string' ? parsed.name : undefined;
    const expectedVersion =
      typeof parsed.version === 'string' ? parsed.version : undefined;

    const pkg = await readSelfPackageJson();
    assert.equal(pkg.name, expectedName);
    assert.equal(pkg.version, expectedVersion);
  });

  void it('is stable across multiple calls (cached)', async () => {
    resetPackageJsonCache();
    const a = await readSelfPackageJson();
    const b = await readSelfPackageJson();
    assert.deepEqual(a, b);
  });
});

void describe('package.readSelfPackageJson findPackageJSON', () => {
  void it('uses findPackageJSON when available', async () => {
    resetPackageJsonCache();
    const deps: PackageJsonDependencies = {
      disableCache: true,
      nodeModule: {
        findPackageJSON: () => '/tmp/package.json',
        createRequire: () => () => ({}),
      },
      readFile: () => Promise.resolve('{"name":"mocked","version":"1.2.3"}'),
    };

    const pkg = await readSelfPackageJson(undefined, deps);
    assert.equal(pkg.name, 'mocked');
    assert.equal(pkg.version, '1.2.3');
  });

  void it('falls back to require when findPackageJSON is missing', async () => {
    resetPackageJsonCache();
    const deps: PackageJsonDependencies = {
      disableCache: true,
      nodeModule: {
        createRequire: () => () => ({ name: 'fallback', version: '9.9.9' }),
      },
    };

    const pkg = await readSelfPackageJson(undefined, deps);
    assert.equal(pkg.name, 'fallback');
    assert.equal(pkg.version, '9.9.9');
  });
});

void describe('package.readSelfPackageJson cache', () => {
  void it('clears cache on failure', async () => {
    resetPackageJsonCache();
    const failingDeps: PackageJsonDependencies = {
      nodeModule: {
        findPackageJSON: () => '/tmp/package.json',
        createRequire: () => () => ({}),
      },
      readFile: () => Promise.reject(new Error('boom')),
    };

    await assert.rejects(() => readSelfPackageJson(undefined, failingDeps));

    const deps: PackageJsonDependencies = {
      nodeModule: {
        findPackageJSON: () => '/tmp/package.json',
        createRequire: () => () => ({}),
      },
      readFile: () => Promise.resolve('{"name":"ok","version":"1.0.0"}'),
    };

    const pkg = await readSelfPackageJson(undefined, deps);
    assert.equal(pkg.name, 'ok');
    assert.equal(pkg.version, '1.0.0');
  });
});

void describe('package.readSelfPackageJson parsing', () => {
  void it('returns empty info for non-object JSON', async () => {
    resetPackageJsonCache();
    const deps: PackageJsonDependencies = {
      disableCache: true,
      nodeModule: {
        findPackageJSON: () => '/tmp/package.json',
        createRequire: () => () => ({}),
      },
      readFile: () => Promise.resolve('null'),
    };

    const pkg = await readSelfPackageJson(undefined, deps);
    assert.equal(pkg.name, undefined);
    assert.equal(pkg.version, undefined);
  });

  void it('returns empty info for non-object require result', async () => {
    resetPackageJsonCache();
    const deps: PackageJsonDependencies = {
      disableCache: true,
      nodeModule: {
        createRequire: () => () => null,
      },
    };

    const pkg = await readSelfPackageJson(undefined, deps);
    assert.equal(pkg.name, undefined);
    assert.equal(pkg.version, undefined);
  });
});

void describe('package.readSelfPackageJson resolver', () => {
  void it('uses loadNodeModule when provided', async () => {
    resetPackageJsonCache();
    const deps: PackageJsonDependencies = {
      disableCache: true,
      loadNodeModule: () =>
        Promise.resolve({
          findPackageJSON: () => '/tmp/package.json',
          createRequire: () => () => ({}),
        }),
      readFile: () => Promise.resolve('{"name":"loaded","version":"3.0.0"}'),
    };

    const pkg = await readSelfPackageJson(undefined, deps);
    assert.equal(pkg.name, 'loaded');
    assert.equal(pkg.version, '3.0.0');
  });
});
