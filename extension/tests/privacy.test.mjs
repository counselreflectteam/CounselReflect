import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { assertAnonymousBuild } from '../vite.config.js';

test('release privacy check rejects workstation user paths without echoing them', () => {
  const testDirectory = mkdtempSync(join(tmpdir(), 'counselreflect-privacy-'));
  const emittedFile = join(testDirectory, 'sidebar.js');

  try {
    writeFileSync(emittedFile, 'const asset = "assets/model.bin";');
    assert.doesNotThrow(() => assertAnonymousBuild(testDirectory));

    const privatePaths = [
      ['', 'home', 'example-user', 'private', 'model.bin'].join('/'),
      ['', 'Users', 'example-user', 'private', 'model.bin'].join('/'),
      ['C:', 'Users', 'example-user', 'private', 'model.bin'].join('\\'),
    ];

    for (const privatePath of privatePaths) {
      writeFileSync(emittedFile, `const asset = ${JSON.stringify(privatePath)};`);

      assert.throws(
        () => assertAnonymousBuild(testDirectory),
        (error) => {
          assert.match(error.message, /Privacy check failed/);
          assert.match(error.message, /sidebar\.js/);
          assert.equal(error.message.includes('example-user'), false);
          return true;
        }
      );
    }
  } finally {
    rmSync(testDirectory, { recursive: true, force: true });
  }
});
