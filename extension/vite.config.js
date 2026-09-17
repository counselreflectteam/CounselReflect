import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve, dirname, relative } from 'path';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { fileURLToPath } from 'url';
import { mkdirSync, readFileSync, readdirSync, renameSync, rmSync } from 'fs';
import { spawnSync } from 'child_process';
import { homedir } from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repositoryDir = resolve(__dirname, '..');

const localUserPathPatterns = [
  /(?:^|[^A-Za-z0-9])\/home\/[A-Za-z0-9._-]+(?:\/|$)/m,
  /(?:^|[^A-Za-z0-9])\/Users\/[A-Za-z0-9._-]+(?:\/|$)/m,
  /(?:^|[^A-Za-z0-9])[A-Za-z]:[\\/]+Users[\\/]+[^\\/\0\r\n\t "'`<>]+(?:[\\/]|$)/im,
];

const walkFiles = (directory) => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const entryPath = resolve(directory, entry.name);
  return entry.isDirectory() ? walkFiles(entryPath) : [entryPath];
});

/**
 * Release artifacts must never disclose the workstation account that built
 * them. Scan every emitted file before archiving, including binary assets,
 * and report only repository-relative filenames if a violation is found.
 */
export const assertAnonymousBuild = (buildDir) => {
  const currentHome = homedir();
  const currentHomeBytes = currentHome ? Buffer.from(currentHome) : null;
  const violations = walkFiles(buildDir).filter((filePath) => {
    const contents = readFileSync(filePath);
    if (currentHomeBytes && contents.includes(currentHomeBytes)) return true;
    const textContents = contents.toString('utf8');
    return localUserPathPatterns.some((pattern) => pattern.test(textContents));
  });

  if (violations.length > 0) {
    const files = violations
      .map((filePath) => relative(repositoryDir, filePath).replaceAll('\\', '/'))
      .join(', ');
    throw new Error(`Privacy check failed: packaged files contain a local user path: ${files}`);
  }
};

/**
 * Keep a ready-to-share ZIP in the repository's output directory after every
 * successful Vite build, including rebuilds from `vite build --watch`.
 * Archive to a temporary path first so consumers never observe a partial ZIP.
 */
const extensionArchivePlugin = ({ buildDir, isPreview }) => ({
  name: 'counselreflect-extension-archive',
  apply: 'build',
  writeBundle: {
    // Static-copy also runs in writeBundle. Force this hook to wait for it so
    // manifest.json/content.css are present before the archive is created.
    order: 'post',
    sequential: true,
    handler() {
      const outputDir = resolve(repositoryDir, 'output');
      const archiveName = isPreview
        ? 'CounselReflect-extension-preview.zip'
        : 'CounselReflect-extension.zip';
      const archivePath = resolve(outputDir, archiveName);
      const temporaryArchivePath = `${archivePath}.${process.pid}.tmp`;
      const archiveDisplayPath = relative(repositoryDir, archivePath).replaceAll('\\', '/');
      const temporaryArchiveArgument = relative(repositoryDir, temporaryArchivePath);
      const buildDirectoryArgument = relative(repositoryDir, buildDir);

      mkdirSync(outputDir, { recursive: true });
      rmSync(temporaryArchivePath, { force: true });
      assertAnonymousBuild(buildDir);

      let result = spawnSync(
        'bsdtar',
        [
          '--format', 'zip',
          '--uid', '0',
          '--gid', '0',
          '--uname', 'anonymous',
          '--gname', 'anonymous',
          '-cf', temporaryArchiveArgument,
          '-C', buildDirectoryArgument,
          // List entries explicitly: archiving '.' would prefix every entry
          // with './', which the Chrome Web Store uploader rejects ("No
          // manifest found in package").
          ...readdirSync(buildDir).sort(),
        ],
        { cwd: repositoryDir, stdio: 'inherit' }
      );

      // Python's zipfile writes plain central-directory archives that every
      // extractor accepts. Prefer it over `jar` on machines without bsdtar:
      // jar emits streaming entries (data descriptors + a JAR marker extra
      // field) that macOS Archive Utility rejects as an unsupported format.
      // Fixed 1980 timestamps keep the archive anonymous and deterministic,
      // matching the uid/uname scrubbing in the bsdtar invocation above.
      if (result.error?.code === 'ENOENT') {
        const pythonZipScript = [
          'import os, sys, zipfile',
          'out, root = sys.argv[1], sys.argv[2]',
          "with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as archive:",
          '    for dirpath, dirnames, filenames in os.walk(root):',
          '        dirnames.sort()',
          '        for name in sorted(filenames):',
          '            path = os.path.join(dirpath, name)',
          "            arcname = os.path.relpath(path, root).replace(os.sep, '/')",
          '            info = zipfile.ZipInfo(arcname)',
          '            info.external_attr = 0o644 << 16',
          "            with open(path, 'rb') as source:",
          '                archive.writestr(info, source.read(), zipfile.ZIP_DEFLATED)',
        ].join('\n');
        result = spawnSync(
          'python3',
          ['-c', pythonZipScript, temporaryArchiveArgument, buildDirectoryArgument],
          { cwd: repositoryDir, stdio: 'inherit' }
        );
      }

      // `jar` is the last resort; its archives open with unzip/Expander but
      // not with macOS Archive Utility.
      if (result.error?.code === 'ENOENT') {
        result = spawnSync(
          'jar',
          ['--create', '--no-manifest', '--file', temporaryArchiveArgument, '-C', buildDirectoryArgument, '.'],
          { cwd: repositoryDir, stdio: 'inherit' }
        );
      }

      if (result.error || result.status !== 0) {
        rmSync(temporaryArchivePath, { force: true });
        throw result.error || new Error(`Extension ZIP creation failed with exit code ${result.status}.`);
      }

      renameSync(temporaryArchivePath, archivePath);
      console.log(`Extension ZIP updated: ${archiveDisplayPath}`);
    }
  }
});

/**
 * Chrome can execute the same content-script file once from the manifest and
 * again through the background fallback. Rollup's multi-entry build emits
 * top-level lexical declarations by default, so a second classic-script
 * injection would fail during parsing before our lifecycle guard can run.
 * Keep the content bundle self-contained on every injection.
 */
const contentScriptIifePlugin = () => ({
  name: 'counselreflect-content-script-iife',
  apply: 'build',
  generateBundle(_options, bundle) {
    const contentChunk = bundle['content.js'];
    if (!contentChunk || contentChunk.type !== 'chunk') {
      throw new Error('Expected the content-script output at content.js.');
    }
    contentChunk.code = `(() => {\n${contentChunk.code}\n})();\n`;
  }
});

// Chrome match patterns ignore ports and paths; compare scheme + hostname only.
const matchesHostPattern = (url, pattern) => {
  const parsed = /^(\*|https?|wss?):\/\/(\*|\*\.[^/]+|[^/*]+)(\/.*)?$/.exec(pattern);
  if (!parsed) return false;
  const [, scheme, host] = parsed;
  const { protocol, hostname } = new URL(url);
  if (scheme !== '*' && `${scheme}:` !== protocol) return false;
  if (host === '*') return true;
  if (host.startsWith('*.')) {
    const base = host.slice(2);
    return hostname === base || hostname.endsWith(`.${base}`);
  }
  return hostname === host;
};

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, '');
  const apiUrl = env.VITE_API_BASE_URL;
  const isPreview = mode === 'preview';
  const buildDir = resolve(__dirname, isPreview ? 'dist-preview' : 'dist');
  const sourceManifest = JSON.parse(readFileSync(resolve(__dirname, 'manifest.json'), 'utf-8'));
  // One id per Vite process/build. Duplicate injections from the same bundle
  // are ignored, while installing a newly built ZIP can replace the stale
  // content-script instance on an already-open conversation tab.
  const contentBuildId = `${sourceManifest.version}-${mode}-${Date.now().toString(36)}`;
  if ((mode === 'production' || isPreview) && !apiUrl) {
    throw new Error(`VITE_API_BASE_URL is not set for the ${mode} build.`);
  }
  const apiOrigin = apiUrl ? new URL(apiUrl).origin : '';
  const manifest = isPreview
    ? {
        ...sourceManifest,
        name: 'CounselReflect Preview',
        description: 'Private preview of CounselReflect for invited research testers',
        version_name: `${sourceManifest.version} preview`,
        host_permissions: [`${apiOrigin}/*`],
        content_security_policy: {
          extension_pages: [
            "default-src 'self'",
            "script-src 'self'",
            "object-src 'self'",
            `connect-src ${apiOrigin}`,
            "img-src 'self' data:",
            "style-src 'self' 'unsafe-inline'",
          ].join('; ') + ';'
        }
      }
    : sourceManifest;

  if (mode === 'production' || isPreview) {
    // Guard against shipping a bundle that talks to an origin the manifest
    // never grants (e.g. a leftover devtunnel or localhost URL).
    const hostPermissions = manifest.host_permissions || [];
    if (!hostPermissions.some((pattern) => matchesHostPattern(apiUrl, pattern))) {
      throw new Error(
        `VITE_API_BASE_URL (${apiUrl}) is not covered by manifest.json host_permissions [${hostPermissions.join(', ')}]. ` +
          'Production builds must target a granted origin; use `npm run dev` (development mode) for local/devtunnel backends.'
      );
    }
    // Preview supports user-supplied or server-managed provider keys. Require
    // an explicit choice; the access-code requirement applies to both modes.
    if (isPreview && !['true', 'false'].includes(env.VITE_SERVER_MANAGED_ONLY)) {
      throw new Error('Preview builds must explicitly set VITE_SERVER_MANAGED_ONLY=true or false.');
    }
    if (isPreview && env.VITE_REQUIRE_ACCESS_CODE !== 'true') {
      throw new Error('Preview builds must set VITE_REQUIRE_ACCESS_CODE=true so an unprotected backend cannot unlock the extension.');
    }
  }

  return {
    base: './',
    define: {
      __COUNSELREFLECT_CONTENT_BUILD_ID__: JSON.stringify(contentBuildId)
    },
    plugins: [
      react(),
      contentScriptIifePlugin(),
      viteStaticCopy({
        targets: [
          {
            src: 'manifest.json',
            dest: '.',
            transform: () => JSON.stringify(manifest, null, 2)
          },
          { src: 'src/content.css', dest: '.' }
        ]
      }),
      extensionArchivePlugin({ buildDir, isPreview })
    ],
    resolve: {
      alias: {
        '@shared': resolve(__dirname, '../shared/src'),
        '@data': resolve(__dirname, '../data')
      }
    },
    build: {
      outDir: buildDir,
      rollupOptions: {
        input: {
          sidebar: resolve(__dirname, 'sidebar.html'),
          background: resolve(__dirname, 'src/background.js'),
          content: resolve(__dirname, 'src/content.js'),
        },
        output: {
          entryFileNames: (chunkInfo) => {
            return chunkInfo.name === 'sidebar' ? 'assets/[name].js' : '[name].js';
          },
          chunkFileNames: 'assets/[name]-[hash].js',
          assetFileNames: (assetInfo) => {
            if (assetInfo.name === 'sidebar.css') {
              return 'assets/sidebar.css';
            }
            return 'assets/[name]-[hash][extname]';
          },
        },
      }
    }
  };
});
