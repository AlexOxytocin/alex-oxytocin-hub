import { copyFile, mkdir, readFile, rm } from 'node:fs/promises';
import { basename, dirname, resolve, sep } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const dist = resolve(root, 'dist');
const sourceDownloads = resolve(dist, 'downloads');
const inventory = JSON.parse(await readFile(resolve(root, 'docs/url-migration-inventory.json'), 'utf8'));
const records = inventory.records.filter(({ kind }) => kind === 'resume-download');

if (records.length === 0) throw new Error('URL inventory contains no resume downloads');

for (const record of records) {
  const sourceUrl = new URL(record.source);
  const targetUrl = new URL(record.final.target);
  if (record.final.action !== 'redirect' || targetUrl.origin !== inventory.production_origin) {
    throw new Error(`Invalid resume contract: ${record.source}`);
  }

  const filename = basename(sourceUrl.pathname);
  const targetRelative = targetUrl.pathname.replace(/^\/+/, '');
  const destination = resolve(dist, targetRelative);
  if (!destination.startsWith(`${dist}${sep}`)) throw new Error(`Unsafe resume target: ${targetUrl.pathname}`);

  await mkdir(dirname(destination), { recursive: true });
  await copyFile(resolve(sourceDownloads, filename), destination);
}

await rm(sourceDownloads, { recursive: true, force: true });
console.log(`Staged ${records.length} resume downloads at their final locale-first URLs.`);
