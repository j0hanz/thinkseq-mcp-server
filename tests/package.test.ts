import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

import { readSelfPackageJson } from '../src/lib/package.js';

interface RawPkg {
  name?: unknown;
  version?: unknown;
}

describe('package.readSelfPackageJson', () => {
  it('returns name/version matching package.json', async () => {
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

  it('is stable across multiple calls (cached)', async () => {
    const a = await readSelfPackageJson();
    const b = await readSelfPackageJson();
    assert.deepEqual(a, b);
  });
});
