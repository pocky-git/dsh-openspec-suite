import { defineConfig } from 'tsdown'

// 只构建宿主半：普通 ESM，所有运行时 peer 均 external（由 profile 的
// node_modules 提供）。客户端半由 scripts/build-client.mjs 打成
// ModuleLoader 信封。
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
    'schemastery',
  ],
})
