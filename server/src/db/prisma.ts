// Author: Preston Lee

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

export const databaseUrl = process.env.BIBLER_SERVER_DATABASE_URL ?? 'postgresql://bibler:password@127.0.0.1:5433/bibler_development';
export const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
