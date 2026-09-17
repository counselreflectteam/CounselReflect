/// <reference types="vitest" />
import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(() => {
    const allowedHosts = [
      'localhost',
      '127.0.0.1',
      // Add a machine-specific LAN IP via VITE_DEV_ALLOWED_HOST instead of
      // committing it.
      ...(process.env.VITE_DEV_ALLOWED_HOST ? [process.env.VITE_DEV_ALLOWED_HOST] : []),
      '.lhr.life',
      '.loca.lt',
      '.ngrok-free.app',
      '.ngrok-free.dev',
      '.ngrok.app',
      '.pinggy-free.link'
    ];

    const apiProxy = {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        rewrite: (requestPath: string) => requestPath.replace(/^\/api/, '')
      }
    };

    return {
      server: {
        port: 5173,
        host: '127.0.0.1',
        allowedHosts,
        fs: {
          allow: [
            path.resolve(__dirname),
            path.resolve(__dirname, '../shared')
          ],
          deny: [
            '**/.env',
            '**/.env.*',
            '**/*.key',
            '**/*.pem',
            '**/api_keys.json',
            '**/secrets.json',
            '**/test_key.sh'
          ]
        },
        proxy: apiProxy
      },
      preview: {
        port: 5173,
        host: '127.0.0.1',
        allowedHosts,
        proxy: apiProxy
      },
      plugins: [react()],
      test: {
        globals: true,
        environment: 'jsdom',
        css: true,
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, './src'),
          '@shared': path.resolve(__dirname, '../shared/src'),
          '@data': path.resolve(__dirname, '../data')
        }
      }
    };
});
