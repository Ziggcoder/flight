import { readdir, readFile, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

async function walk(dir) {
  const result = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const name = path.join(dir, entry.name);
    if (entry.isDirectory()) result.push(...await walk(name));
    else result.push(name);
  }
  return result;
}
const files = [...await walk('src'), ...await walk('tests'), ...await walk('scripts'), 'vite.config.js'];
for (const file of files.filter(f => /\.m?js$/.test(f))) {
  const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (check.status !== 0) throw new Error(check.stderr);
  const source = await readFile(file, 'utf8');
  for (const match of source.matchAll(/(?:from\s+|import\s*)['"]([^'"]+)['"]/g)) {
    if (match[1].startsWith('.')) await access(path.resolve(path.dirname(file), match[1]));
  }
}
const html = await readFile('dist/index.html', 'utf8');
for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
  if (/^https?:/.test(match[1])) throw new Error('External production asset: ' + match[1]);
  await access(path.resolve('dist', match[1]));
}
console.log('PASS: JavaScript syntax, local imports, and all production HTML assets.');
