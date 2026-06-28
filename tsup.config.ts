import { defineConfig } from 'tsup';

/**
 * Agent build. Bundles the polling agent into a CommonJS file and leaves
 * node_modules external (resolved at runtime). CJS keeps dynamic
 * `import('steam-user')` and friends simple even though package.json is ESM.
 * (The hub is now a Go binary built via `npm run build:hub`.)
 */
export default defineConfig({
  entry: { 'agent/index': 'src/agent/index.ts' },
  outDir: 'dist',
  format: ['cjs'],
  platform: 'node',
  target: 'node20',
  // Do NOT clean: vite writes dist/public first and we must not wipe it.
  clean: false,
  sourcemap: true,
  minify: false,
  splitting: false,
  skipNodeModulesBundle: true,
  shims: true,
});
