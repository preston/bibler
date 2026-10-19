// Author: Preston Lee

import { Client } from 'pg';
import { writeFile } from 'node:fs/promises';
import { readCatalog } from './catalog.ts';

// Run only against a development database after applying all committed migrations.
const url = process.env.BIBLER_SERVER_DATABASE_URL;
if (!url) throw new Error('BIBLER_SERVER_DATABASE_URL is required to snapshot the schema.');
const client = new Client({ connectionString: url });
await client.connect();
try {
  await writeFile(new URL('../../prisma/schema-catalog.json', import.meta.url), JSON.stringify(await readCatalog(client), null, 2) + '\n');
  console.log('Updated the current schema catalog. Review it alongside the generated migration.');
} finally { await client.end(); }
