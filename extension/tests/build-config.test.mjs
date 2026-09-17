import assert from 'node:assert/strict';
import test from 'node:test';

import configureExtension from '../vite.config.js';

const withPreviewEnvironment = (overrides, run) => {
  const values = {
    VITE_API_BASE_URL: 'https://preview.example.test/api',
    VITE_SERVER_MANAGED_ONLY: 'false',
    VITE_REQUIRE_ACCESS_CODE: 'true',
    ...overrides,
  };
  const previous = Object.fromEntries(
    Object.keys(values).map((name) => [name, process.env[name]])
  );

  try {
    Object.assign(process.env, values);
    run();
  } finally {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
};

for (const mode of ['false', 'true']) {
  test(`protected preview supports VITE_SERVER_MANAGED_ONLY=${mode}`, () => {
    withPreviewEnvironment({ VITE_SERVER_MANAGED_ONLY: mode }, () => {
      assert.doesNotThrow(() => configureExtension({ mode: 'preview' }));
    });
  });

  test(`preview still rejects disabled access-code protection in key mode ${mode}`, () => {
    withPreviewEnvironment({
      VITE_SERVER_MANAGED_ONLY: mode,
      VITE_REQUIRE_ACCESS_CODE: 'false',
    }, () => {
      assert.throws(
        () => configureExtension({ mode: 'preview' }),
        /must set VITE_REQUIRE_ACCESS_CODE=true/
      );
    });
  });
}

for (const value of ['', 'invalid']) {
  test(`preview rejects an unspecified or invalid key policy (${JSON.stringify(value)})`, () => {
    withPreviewEnvironment({ VITE_SERVER_MANAGED_ONLY: value }, () => {
      assert.throws(
        () => configureExtension({ mode: 'preview' }),
        /must explicitly set VITE_SERVER_MANAGED_ONLY=true or false/
      );
    });
  });
}
