import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve, dirname } from 'path';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  base: './',
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        { src: 'manifest.json', dest: '.' },
        { src: 'src/content.css', dest: '.' },
        { src: 'public/icons', dest: '.' },
        { src: 'public/logo.png', dest: '.' }
      ]
    })
  ],
  resolve: {
    alias: {
      '@shared': resolve(__dirname, '../shared/src'),
      '@data': resolve(__dirname, '../data')
    }
  },
  build: {
    outDir: 'dist',
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
});
