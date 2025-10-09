import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { nodePolyfills } from "vite-plugin-node-polyfills";

const host = process.env.TAURI_DEV_HOST;

// https://vitejs.dev/config/
export default defineConfig(async () => ({
  plugins: [
    react({
      // Ensure that all .jsx, .tsx, .js, and .ts files are included.
      include: "**/*.{jsx,tsx,js,ts}",
    }),
    // ⬇️ Polyfill Node core (crypto/pbkdf2, Buffer, process, etc.) in the renderer
    nodePolyfills({
      include: ["buffer", "process", "util", "events", "stream", "path", "crypto"],
      globals: { Buffer: true, process: true },
    }),
  ],

  // Give libs a defined env object (some check process.env directly)
  define: {
    "process.env": {},
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  clearScreen: false,
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
      ignored: ["**/src-tauri/**"],
    },
  },

  resolve: {
    extensions: [".mjs", ".js", ".ts", ".jsx", ".tsx", ".json"],
    preserveSymlinks: true,
    // Ensure Node core modules resolve to browser shims
    alias: {
      stream: "stream-browserify",
      crypto: "crypto-browserify",
    },
  },

  // Pre-bundle shims so they’re available at runtime
  optimizeDeps: {
    include: [
      "buffer",
      "process",
      "util",
      "events",
      "stream-browserify",
      "crypto-browserify",
      "pbkdf2",
    ],
  },
}));
