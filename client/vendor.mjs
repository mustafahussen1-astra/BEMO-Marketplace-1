import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';

const root = fileURLToPath(new URL('.', import.meta.url));
const lock = JSON.parse(await readFile(resolve(root, 'package-lock.json'), 'utf8'));
const version = lock.packages['node_modules/@supabase/supabase-js'].version;
if (version !== '2.118.0') throw new Error('Review SDK version before changing the browser bundle.');
const source = await readFile(resolve(root, 'node_modules/@supabase/supabase-js/dist/umd/supabase.js'));
const output = resolve(root, '../dist/vendor');
await mkdir(output, { recursive: true });
let notices = 'BEMO browser dependency notices\nOfficial Supabase UMD bundle; pinned dependencies in client/package-lock.json.\n';
for (const [path, details] of Object.entries(lock.packages).sort(([a], [b]) => a.localeCompare(b))) {
  if (!path) continue;
  const directory = resolve(root, path);
  const pkg = JSON.parse(await readFile(resolve(directory, 'package.json'), 'utf8'));
  if (pkg.version !== details.version) throw new Error(`Installed version differs from lockfile: ${pkg.name}`);
  const licenseFiles = (await readdir(directory)).filter(name => /^(license|copyrightnotice)(\.|$)/i.test(name)).sort();
  if (!licenseFiles.length) throw new Error(`Missing license: ${pkg.name}`);
  notices += `\n=== ${pkg.name} ${pkg.version} (${details.license}) ===\n`;
  for (const name of licenseFiles) notices += `\n${name}\n${await readFile(resolve(directory, name), 'utf8')}\n`;
}
await writeFile(resolve(output, `supabase-${version}.js`), source);
await writeFile(resolve(output, 'THIRD_PARTY_NOTICES.txt'), notices);
console.log(JSON.stringify({ version, bytes: source.length, gzipBytes: gzipSync(source).length, sha256: createHash('sha256').update(source).digest('hex') }));
