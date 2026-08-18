// 极简客户端打包器：esbuild 把 src/client.tsx 打成单个 IIFE（唯一的外部
// 依赖是 `react`，保留为 require 调用）；less 把 src/client.less 编译成
// CSS；然后本脚本把它们一起包进 DSH client-modules 服务在
// /plugins/<id>/client.js 下发的 `window.__ModuleLoader__.load` 信封——
// 与 dsh-better-sidebar 的 lib/client.js 相同的线上格式。
import { build } from 'esbuild'
import less from 'less'
import { mkdir, readFile, writeFile } from 'node:fs/promises'

const MODULE_ID = 'dsh-openspec-suite'

const [result, lessSource] = await Promise.all([
  build({
    entryPoints: ['src/client.tsx'],
    bundle: true,
    format: 'cjs',
    platform: 'browser',
    write: false,
    jsx: 'automatic',
    outfile: 'client.cjs',
    external: ['react', 'react/jsx-runtime', 'react-dom'],
    loader: { '.less': 'empty' }, // 样式走独立的 less 编译，不进 JS 包
  }),
  readFile('src/client.less', 'utf8'),
])

// 编译 less；业务样式原样输出（类名以 oss- 前缀自带命名空间）
const lessOutput = await less.render(lessSource, { filename: 'client.less' })

let code = result.outputFiles[0].text
// 把对外部依赖的 CommonJS require 重写为 ModuleLoader 的 `require`
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
// ── 样式：编译自 src/client.less ────────────────────────────────────────────
(function () {
\tvar css = ${JSON.stringify(lessOutput.css)};
\tvar mount = function () {
\t\tif (document.getElementById('openspec-suite-style')) return;
\t\tvar style = document.createElement('style');
\t\tstyle.id = 'openspec-suite-style';
\t\tstyle.textContent = css;
\t\tdocument.head.appendChild(style);
\t};
\tif (document.head) mount();
\telse document.addEventListener('DOMContentLoaded', mount);
})();
`

await mkdir('lib', { recursive: true })
await writeFile('lib/client.js', bundle, 'utf8')
const written = await readFile('lib/client.js', 'utf8')
console.log(`wrote lib/client.js (${written.length} bytes)`)
