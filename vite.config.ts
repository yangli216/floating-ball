import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath, URL } from "node:url";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [vue()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@app": fileURLToPath(new URL("./src/app", import.meta.url)),
      "@features": fileURLToPath(new URL("./src/features", import.meta.url)),
      "@entities": fileURLToPath(new URL("./src/entities", import.meta.url)),
      "@shared": fileURLToPath(new URL("./src/shared", import.meta.url)),
      "@services": fileURLToPath(new URL("./src/services", import.meta.url)),
    },
  },
  build: {
    chunkSizeWarningLimit: 3500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return undefined;
          }

          if (id.includes('/echarts/')) {
            return 'vendor-echarts';
          }
          if (id.includes('/@iconify-json/lucide/')) {
            return 'icons-lucide';
          }
          if (id.includes('/@iconify-json/mdi/')) {
            return 'icons-mdi';
          }
          if (id.includes('/@iconify-json/healthicons/')) {
            return 'icons-health';
          }
          if (id.includes('/@iconify/')) {
            return 'vendor-iconify';
          }
          if (id.includes('/@tauri-apps/')) {
            return 'vendor-tauri';
          }
          if (id.includes('/markdown-it/') || id.includes('/highlight.js/')) {
            return 'vendor-markdown';
          }
          if (id.includes('/tiny-pinyin/')) {
            return 'vendor-pinyin';
          }
          if (id.includes('/vue/') || id.includes('/pinia/')) {
            return 'vendor-vue';
          }

          return 'vendor';
        },
      },
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
