// Author: Preston Lee

import { Client } from 'pg';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readCatalog, catalogDifference } from './catalog.ts';

export const baselineName = '00000000000000_baseline';
const project = fileURLToPath(new URL('../../', import.meta.url));
const cli = fileURLToPath(new URL('../../../node_modules/prisma/build/index.js', import.meta.url));

async function runPrisma(databaseUrl: string, args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [cli, ...args], {
      cwd: project, env: { ...process.env, BIBLER_SERVER_DATABASE_URL: databaseUrl }, stdio: 'inherit'
    });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(`Database migration command failed (${code}).`)));
  });
}

export async function bootstrap(databaseUrl: string): Promise<void> {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    // Keep this connection alive for the entire CLI run so concurrent replicas cannot adopt twice.
    await client.query('SELECT pg_advisory_lock(1684628076, 5)');
    const historyExists = (await client.query("SELECT to_regclass('public._prisma_migrations') AS name")).rows[0]?.name;
    const history = historyExists ? (await client.query('SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations')).rows : [];
    if (history.some(row => !row.finished_at && !row.rolled_back_at)) {
      throw new Error('An unfinished migration exists. Restore or repair it before starting the server.');
    }
    const expected = JSON.parse(await readFile(new URL('../../prisma/baseline-catalog.json', import.meta.url), 'utf8')) as Record<string, unknown[]>;
    if (!history.some(row => row.migration_name === baselineName && row.finished_at)) {
      const actual = await readCatalog(client);
      if ((actual.relations?.length ?? 0) > 0) {
        const differences = catalogDifference(expected, actual);
        if (differences.length) throw new Error(`Database does not match the supported baseline (${differences.join(', ')}). No adoption performed.`);
        const versionTable = (await client.query("SELECT to_regclass('public.schema_migrations') AS name")).rows[0]?.name;
        if (!versionTable || !(await client.query("SELECT 1 FROM schema_migrations WHERE version='4'")).rowCount) {
          throw new Error('Populated database is missing baseline version 4 bookkeeping. No adoption performed.');
        }
        await runPrisma(databaseUrl, ['migrate', 'resolve', '--applied', baselineName]);
      }
    }
    await runPrisma(databaseUrl, ['migrate', 'deploy']);
    const current = JSON.parse(await readFile(new URL('../../prisma/schema-catalog.json', import.meta.url), 'utf8')) as Record<string, unknown[]>;
    const differences = catalogDifference(current, await readCatalog(client));
    if (differences.length) throw new Error(`Database schema verification failed (${differences.join(', ')}). Server startup refused.`);
  } finally {
    await client.query('SELECT pg_advisory_unlock(1684628076, 5)').catch(() => undefined);
    await client.end();
  }
}

if (import.meta.main) {
  const url = process.env.BIBLER_SERVER_DATABASE_URL;
  if (!url) throw new Error('BIBLER_SERVER_DATABASE_URL is required for database bootstrap.');
  await bootstrap(url);
}
