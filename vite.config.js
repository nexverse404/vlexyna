import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: true,
    allowedHosts: true,
    watch: { ignored: ['**/src-tauri/**'] },
  },
  preview: {
    port: 1420,
    strictPort: true,
    host: true,
    allowedHosts: true,
  },
  build: { target: 'es2022', outDir: 'dist', chunkSizeWarningLimit: 1500 },
});
