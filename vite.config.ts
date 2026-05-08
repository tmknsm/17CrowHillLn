import { defineConfig } from "vite";

// The repo is published at https://tmknsm.github.io/17CrowHillLn/, so the
// production base path is the repo name. Locally (npm run dev) Vite ignores
// `base` and serves from /, so dev unaffected.
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/17CrowHillLn/" : "/",
  server: {
    port: 5173,
    open: false
  },
  build: {
    target: "es2020",
    sourcemap: true
  }
}));
