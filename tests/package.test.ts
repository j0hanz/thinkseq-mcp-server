import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

import type { PackageJsonDependencies } from '../src/lib/package.js';
import { readSelfPackageJson } from '../src/lib/package.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

void describe('package.readSelfPackageJson', () => {
  void it('returns name/version matching package.json', async () => {
    const raw = await readFile(
      new URL('../package.json', import.meta.url),
      'utf8'
    );
    const parsed: unknown = JSON.parse(raw);
    const expectedName =
      isRecord(parsed) && typeof parsed.name === 'string'
        ? parsed.name
        : undefined;
    const expectedVersion =
      isRecord(parsed) && typeof parsed.version === 'string'
        ? parsed.version
        : undefined;

    const pkg = await readSelfPackageJson();
    assert.equal(pkg.name, expectedName);
    assert.equal(pkg.version, expectedVersion);
  });

  void it('uses provided readFile implementation', async () => {
    const deps: PackageJsonDependencies = {
      cwd: () => '/tmp',
      readFile: () => Promise.resolve('{"name":"mocked","version":"1.2.3"}'),
    };

    const pkg = await readSelfPackageJson(undefined, deps);
    assert.equal(pkg.name, 'mocked');
    assert.equal(pkg.version, '1.2.3');
  });

  void it('returns empty info for non-object JSON', async () => {
    const deps: PackageJsonDependencies = {
      cwd: () => '/tmp',
      readFile: () => Promise.resolve('null'),
    };

    const pkg = await readSelfPackageJson(undefined, deps);
    assert.equal(pkg.name, undefined);
    assert.equal(pkg.version, undefined);
  });
});

void describe('package.readSelfPackageJson resilience', () => {
  void it('returns empty info when readFile throws', async () => {
    const deps: PackageJsonDependencies = {
      cwd: () => '/tmp',
      readFile: () => Promise.reject(new Error('ENOENT: file not found')),
    };

    const pkg = await readSelfPackageJson(undefined, deps);
    assert.equal(pkg.name, undefined);
    assert.equal(pkg.version, undefined);
  });

  void it('returns empty info for malformed JSON', async () => {
    const deps: PackageJsonDependencies = {
      cwd: () => '/tmp',
      readFile: () => Promise.resolve('{ invalid json'),
    };

    const pkg = await readSelfPackageJson(undefined, deps);
    assert.equal(pkg.name, undefined);
    assert.equal(pkg.version, undefined);
  });
});
