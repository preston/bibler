// Author: Preston Lee

import { defineConfig } from 'prisma/config';
import { loadEnvFile } from 'node:process';

try { loadEnvFile(); } catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: process.env.BIBLER_SERVER_DATABASE_URL ?? 'postgresql://bibler:password@127.0.0.1:5433/bibler_development' }
});
