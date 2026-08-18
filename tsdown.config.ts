import { defineConfig } from 'tsdown'

// Host half only: plain ESM, every runtime peer externalized (the profile's
// node_modules provides them). The client half is bundled by
// scripts/build-client.mjs into the ModuleLoader envelope.
export default defineConfig({
  entry: ['src/index.ts'],
  outDir: 'lib',
  format: 'esm',
  dts: true,
  platform: 'node',
  external: [
    '@deepseek-ai/cordis',
    '@deepseek-ai/dsh-settings',
    '@deepseek-ai/dsh-session',
    '@deepseek-ai/dsh-host-directory-picker',
    '@deepseek-ai/cordis-plugin-loader',
    'dsh-better-sidebar',
    'schemastery',
  ],
})
