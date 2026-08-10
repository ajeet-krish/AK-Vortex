import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react-swc';
import glsl from 'vite-plugin-glsl';

// Disable React refresh in Tauri (WKWebView CJS/ESM interop breaks preamble)
function disableReactRefresh(): Plugin {
  return {
    name: 'disable-react-refresh',
    enforce: 'pre',
    resolveId(id) {
      if (id === '/@react-refresh') return '\0virtual:react-refresh';
    },
    load(id) {
      if (id === '\0virtual:react-refresh') {
        return 'export default {}; export function injectIntoGlobalHook() {}';
      }
    },
  };
}

export default defineConfig({
  plugins: [disableReactRefresh(), react(), glsl()],
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
  },
  envPrefix: ['VITE_', 'TAURI_'],
  build: {
    target: process.env.TAURI_PLATFORM === 'windows' ? 'chrome105' : 'safari13',
    minify: !process.env.TAURI_DEBUG ? 'esbuild' : false,
    sourcemap: !!process.env.TAURI_DEBUG,
  },
});
