import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const rubricPath = path.join(root, 'api/literature/literature_rubrics.json');
const outputPaths = [
  path.join(root, 'api/literature/literature_reference_titles.json'),
  path.join(root, 'shared/src/data/literatureReferenceTitles.json')
];
const endpoint = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi';

const rubrics = JSON.parse(await readFile(rubricPath, 'utf8'));
const urls = [...new Set(rubrics.flatMap((metric) => metric.references || []))].sort();
const entries = urls.map((url) => {
  const match = url.match(/\/articles\/PMC(\d+)\/?$/i);
  if (!match) throw new Error(`Unsupported literature reference URL: ${url}`);
  return { url, id: match[1] };
});

const summaries = new Map();
const batchSize = 150;

for (let start = 0; start < entries.length; start += batchSize) {
  const batch = entries.slice(start, start + batchSize);
  const body = new URLSearchParams({
    db: 'pmc',
    id: batch.map(({ id }) => id).join(','),
    retmode: 'json',
    tool: 'CounselReflect'
  });
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  if (!response.ok) {
    throw new Error(`NCBI ESummary request failed: ${response.status} ${response.statusText}`);
  }
  const payload = await response.json();
  for (const id of payload.result?.uids || []) {
    const title = payload.result[id]?.title?.trim();
    if (title) summaries.set(id, title.replace(/\.$/, ''));
  }
}

const missing = entries.filter(({ id }) => !summaries.has(id));
if (missing.length > 0) {
  throw new Error(`NCBI returned no title for ${missing.map(({ url }) => url).join(', ')}`);
}

const titleMap = Object.fromEntries(entries.map(({ url, id }) => [url, summaries.get(id)]));
await Promise.all(
  outputPaths.map((outputPath) => writeFile(outputPath, `${JSON.stringify(titleMap, null, 2)}\n`, 'utf8'))
);
console.log(
  `Wrote ${entries.length} verified PMC titles to ${outputPaths.map((outputPath) => path.relative(root, outputPath)).join(' and ')}`
);
