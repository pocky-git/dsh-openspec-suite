// Minimal client bundler: esbuild bundles src/client.tsx into one IIFE whose
// only external is `react` (kept as a require call), then this script wraps it
// in the `window.__ModuleLoader__.load` envelope the DSH client-modules
// service serves at /plugins/<id>/client.js — the same wire shape as
// dsh-better-sidebar's lib/client.js.
import { build } from 'esbuild'
import { mkdir, readFile, writeFile } from 'node:fs/promises'

const MODULE_ID = 'dsh-openspec-suite'

const result = await build({
  entryPoints: ['src/client.tsx'],
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  write: false,
  jsx: 'automatic',
  outfile: 'client.cjs',
  external: ['react', 'react/jsx-runtime', 'react-dom'],
})

let code = result.outputFiles[0].text
// Rewrite CommonJS requires of externals into the ModuleLoader `require`.
code = code.replace(/^\s*("use strict";)?/u, '$1')

const bundle = `window.__ModuleLoader__.load({
\tid: "${MODULE_ID}",
\tfactory: (require) => {
\t\tvar module = { exports: {} };
\t\tvar exports = module.exports;
\t\t(function (require, module, exports) {
${code.split('\n').map((line) => `\t\t\t${line}`).join('\n')}
\t\t})(require, module, exports);
\t\treturn module.exports;
\t}
});
`

await mkdir('lib', { recursive: true })
await writeFile('lib/client.js', bundle, 'utf8')
const written = await readFile('lib/client.js', 'utf8')
console.log(`wrote lib/client.js (${written.length} bytes)`)
