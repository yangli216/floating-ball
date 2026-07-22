import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';

const sourceRoot = fileURLToPath(new URL('../../src', import.meta.url));

export default defineConfig({
  plugins: [vue()],
  publicDir: fileURLToPath(new URL('../../public', import.meta.url)),
  resolve: {
    alias: {
      '@': sourceRoot,
      '@app': `${sourceRoot}/app`,
      '@features': `${sourceRoot}/features`,
      '@entities': `${sourceRoot}/entities`,
      '@shared': `${sourceRoot}/shared`,
      '@services': `${sourceRoot}/services`,
    },
  },
  server: {
    host: '127.0.0.1',
    port: 1430,
    strictPort: true,
    fs: {
      allow: [fileURLToPath(new URL('../..', import.meta.url))],
    },
  },
});
