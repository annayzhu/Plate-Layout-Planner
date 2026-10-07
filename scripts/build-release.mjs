// One manifest drives the Desktop release and the LabNest embedded copy.
import { readFile, writeFile, mkdir, copyFile, access } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const destination = resolve(process.argv[2] || '');
if (!process.argv[2] || destination === root) throw new Error('Provide a new output directory');
try { await access(destination); throw new Error('Output already exists; choose a new directory'); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const html = await readFile(resolve(root, 'index.html'), 'utf8');
const files = ['index.html', 'README.md', 'vendor/preparation-kernel.provenance.json', ...[...html.matchAll(/(?:src|href)="([^"?#]+)(?:\?[^"#]*)?"/g)].map(m=>m[1]).filter(file=>/\.(css|js)$/.test(file))];
for (const file of files) {
  execFileSync('git', ['ls-files', '--error-unmatch', file], {cwd:root,stdio:'pipe'});
  execFileSync('git', ['diff', '--quiet', 'HEAD', '--', file], {cwd:root});
}
const commit = execFileSync('git', ['rev-parse','HEAD'], {cwd:root,encoding:'utf8'}).trim();
const hashes = {};
for (const file of files) {
  const data = await readFile(resolve(root,file));
  hashes[file] = createHash('sha256').update(data).digest('hex');
  await mkdir(dirname(resolve(destination,file)), {recursive:true});
  await copyFile(resolve(root,file),resolve(destination,file));
}
await writeFile(resolve(destination,'release.json'),JSON.stringify({product:'Plate Layout Planner',commit,files:hashes},null,2)+'\n');
console.log(JSON.stringify({destination,commit,files:files.length},null,2));
