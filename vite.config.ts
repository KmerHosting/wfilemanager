// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  vite: {
    css: { transformer: "postcss" },
    // Carbon 1.114 emits modern @position-try rules used by DatePicker. Vite 8's default
    // Lightning CSS minifier currently rejects the nested selector inside that rule. Keep JS
    // minification enabled while leaving the already-optimized Carbon CSS unminified.
    build: { cssMinify: false },
  },
  nitro: { preset: process.env.VERCEL ? "vercel" : "node-server" },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
