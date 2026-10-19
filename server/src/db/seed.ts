// Author: Preston Lee

import { hash } from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { prisma } from './prisma.ts';

export async function seed(): Promise<void> {
  const username = (process.env.BIBLER_SERVER_BOOTSTRAP_ADMIN_USERNAME ?? 'administrator').trim();
  if (!username) throw new Error('BIBLER_SERVER_BOOTSTRAP_ADMIN_USERNAME must not be empty.');
  const existing = await prisma.user.findFirst({ where: { username: { equals: username, mode: 'insensitive' } } });
  const password = process.env.BIBLER_SERVER_BOOTSTRAP_ADMIN_PASSWORD;
  if (!existing && (!password || password.length < 6)) throw new Error('Set BIBLER_SERVER_BOOTSTRAP_ADMIN_PASSWORD (at least 6 characters) to create the initial administrator.');
  const existingRole = await prisma.role.findUnique({ where: { name: 'Administrator' } });
  if (existingRole && !existingRole.administrator) throw new Error('The existing Administrator role does not grant administrator access. Resolve the role name conflict before bootstrapping.');
  const now = new Date();
  const role = await prisma.role.upsert({ where: { name: 'Administrator' }, update: {}, create: {
    name: 'Administrator', administrator: true, access: true, bibles: true, curation: true,
    isDefault: false, createdAt: now, updatedAt: now
  } });
  const user = existing ?? await prisma.user.create({ data: {
    username, name: 'Administrator', email: process.env.BIBLER_SERVER_BOOTSTRAP_ADMIN_EMAIL ?? 'administrator@localhost',
    encryptedPassword: await hash(password!, 12), apiToken: randomBytes(24).toString('base64url'), createdAt: now, updatedAt: now
  } });
  await prisma.rolesUser.upsert({ where: { userId_roleId: { userId: user.id, roleId: role.id } }, update: {}, create: { userId: user.id, roleId: role.id } });
  console.log(`Administrator ready: ${user.username}`);
}

if (import.meta.main) {
  try { await seed(); } finally { await prisma.$disconnect(); }
}
