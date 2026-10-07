// Regenerate only from the reviewed LabNest checkout; no runtime LabNest dependency.
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(process.argv[2] || '');
if (!process.argv[2]) throw new Error('Usage: node scripts/sync-preparation-kernel.mjs /path/to/LabNest');
const require = createRequire(resolve(source, 'package.json'));
const { build } = require('esbuild');
const result = await build({
  stdin: { contents: "export {mixPlan,batchPlan,dilution,addStock} from './src/lib/calculators/planning'; export {convert,parseScalar} from './src/lib/calculators/quantities';", resolveDir: source, loader: 'ts' },
  bundle: true, format: 'iife', globalName: 'PreparationKernel', platform: 'browser', target: 'es2022',
  write: false, metafile: true, legalComments: 'none',
  footer: { js: 'if (typeof module === "object" && module.exports) module.exports = PreparationKernel;' },
});
await mkdir(resolve(root, 'vendor'), { recursive: true });
const sha = (data) => createHash('sha256').update(data).digest('hex');
const inputs = {};
for (const file of Object.keys(result.metafile.inputs).filter(file => file !== '<stdin>')) {
  const absolute = resolve(file);
  inputs[absolute.replace(source + '/', '')] = sha(await readFile(absolute));
}
const code = result.outputFiles[0].text;
await writeFile(resolve(root, 'vendor/preparation-kernel.js'), code);
await writeFile(resolve(root, 'vendor/preparation-kernel.provenance.json'), JSON.stringify({
  repository: 'annayzhu/LabNest', commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: source, encoding: 'utf8' }).trim(),
  exports: ['mixPlan', 'batchPlan', 'dilution', 'addStock', 'convert', 'parseScalar'], inputs, sha256: sha(code),
}, null, 2) + '\n');
console.log(`Built ${code.length} bytes from ${Object.keys(inputs).length} source files`);
