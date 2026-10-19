import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { Prisma } from '@prisma/client';
import type { SessionResponse } from 'bibler-core';
import { Router } from 'express';
import { prisma } from '../db/prisma.ts';
import { ApiError, body, meta, notFound, pagination, param, present, string, truthy, validation } from '../http.ts';
import { permissionsFor, requirePermission, requireUser, rolesFor, type RoleRecord, type UserRecord } from '../auth/access.ts';
import { bibleJson, roleJson, userJson } from '../services/serializers.ts';

const token = () => randomBytes(24).toString('base64url');
async function sessionJson(user: UserRecord): Promise<SessionResponse> {
  if (!user.apiToken) throw new ApiError(401, 'Authentication required.');
  const roles = await rolesFor(user.id);
  return { token: user.apiToken, user: { id: user.id, username: user.username, email: user.email, name: user.name }, roles: roles.map(roleJson), permissions: permissionsFor(roles) };
}
async function detail(user: UserRecord) { return { ...userJson(user), roles: (await rolesFor(user.id)).map(roleJson) }; }

export function createSystemRouter() {
  const router = Router();
  router.post('/session', async (req, res) => {
    const input = body(req);
    const username = string(input.username).trim();
    const user = await prisma.user.findFirst({ where: { username: { equals: username, mode: 'insensitive' } } });
    if (!user || !await bcrypt.compare(string(input.password), user.encryptedPassword)) throw new ApiError(401, 'Invalid username or password.');
    const updated = await prisma.user.update({ where: { id: user.id }, data: { apiToken: token(), updatedAt: new Date() } });
    res.status(201).json(await sessionJson(updated));
  });
  router.get('/session', async (_req, res) => res.json(await sessionJson(requireUser(res))));
  router.delete('/session', async (_req, res) => {
    await prisma.user.update({ where: { id: requireUser(res).id }, data: { apiToken: token(), updatedAt: new Date() } });
    res.status(204).end();
  });

  router.get('/system/roles', async (_req, res) => {
    requirePermission(res, 'access');
    res.json({ roles: (await prisma.role.findMany({ orderBy: { name: 'asc' } })).map(roleJson) });
  });
  router.get('/system/roles/:id', async (req, res) => {
    requirePermission(res, 'access');
    res.json({ role: roleJson(await prisma.role.findUnique({ where: { id: param(req, 'id') } }) ?? notFound('Role')) });
  });
  router.post('/system/roles', async (req, res) => {
    requirePermission(res, 'access');
    const data = roleInput(body(req, 'role'));
    validation(present(data.name) ? [] : ["Name can't be blank."]);
    const now = new Date();
    const role = await prisma.role.create({ data: { name: string(data.name), ...data, createdAt: now, updatedAt: now } });
    res.status(201).json({ role: roleJson(role) });
  });
  router.patch('/system/roles/:id', async (req, res) => {
    requirePermission(res, 'access');
    const role = await prisma.role.findUnique({ where: { id: param(req, 'id') } }) ?? notFound('Role');
    const data = roleInput(body(req, 'role'));
    validation('name' in data && !present(data.name) ? ["Name can't be blank."] : []);
    res.json({ role: roleJson(await prisma.role.update({ where: { id: role.id }, data: { ...data, updatedAt: new Date() } })) });
  });
  router.delete('/system/roles/:id', async (req, res) => {
    requirePermission(res, 'access');
    const id = param(req, 'id');
    await prisma.$transaction(async (tx) => {
      await tx.rolesUser.deleteMany({ where: { roleId: id } });
      await tx.role.delete({ where: { id } });
    });
    res.status(204).end();
  });

  router.get('/system/users', async (req, res) => {
    requirePermission(res, 'access');
    const p = pagination(req, ['username', 'email', 'name', 'createdAt', 'updatedAt'], 'username');
    const where = p.q ? { OR: ['username', 'email', 'name'].map((field) => ({ [field]: { contains: p.q, mode: 'insensitive' as const } })) } : {};
    const [total, users] = await Promise.all([prisma.user.count({ where }), prisma.user.findMany({ where, orderBy: { [p.sort]: p.direction }, skip: p.skip, take: p.perPage })]);
    res.json({ users: users.map(userJson), meta: meta(p, total) });
  });
  router.get('/system/users/:id', async (req, res) => {
    requirePermission(res, 'access');
    res.json({ user: await detail(await prisma.user.findUnique({ where: { id: param(req, 'id') } }) ?? notFound('User')) });
  });
  router.post('/system/users', async (req, res) => {
    requirePermission(res, 'access');
    const input = body(req, 'user');
    const fields = await userInput(input, true);
    const roleIds = await requestedRoleIds(req.body?.roleIds);
    const defaults = await prisma.role.findMany({ where: { isDefault: true } });
    const now = new Date();
    const user = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({ data: { username: string(fields.username), email: string(fields.email), name: string(fields.name), encryptedPassword: string(fields.encryptedPassword), apiToken: token(), createdAt: now, updatedAt: now } });
      for (const roleId of new Set([...roleIds, ...defaults.map((r) => r.id)])) await tx.rolesUser.create({ data: { userId: user.id, roleId } });
      return user;
    });
    res.status(201).json({ user: await detail(user) });
  });
  router.patch('/system/users/:id', async (req, res) => {
    requirePermission(res, 'access');
    const user = await prisma.user.findUnique({ where: { id: param(req, 'id') } }) ?? notFound('User');
    const input = body(req, 'user', false);
    const fields = await userInput(input, false, user.id);
    const roleIds = req.body?.roleIds === undefined ? undefined : await requestedRoleIds(req.body.roleIds);
    const updated = await prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({ where: { id: user.id }, data: { ...fields, updatedAt: new Date() } });
      if (roleIds) {
        await tx.rolesUser.deleteMany({ where: { userId: user.id } });
        for (const roleId of roleIds) await tx.rolesUser.create({ data: { userId: user.id, roleId } });
      }
      return updated;
    });
    res.json({ user: await detail(updated) });
  });

  router.get('/system/settings/ai-defaults', async (req, res) => {
    requirePermission(res, 'bibles');
    const p = pagination(req, ['name', 'uuid', 'language', 'abbreviation', 'updatedAt'], 'name');
    const matchingIds = p.q ? await prisma.$queryRaw<Array<{ id: string }>>`SELECT id FROM bibles WHERE CAST(id AS text) ILIKE ${`%${p.q}%`}` : [];
    const where: Prisma.BibleWhereInput = p.q ? { OR: [
      { name: { contains: p.q, mode: 'insensitive' } }, { language: { contains: p.q, mode: 'insensitive' } },
      { abbreviation: { contains: p.q, mode: 'insensitive' } }, { id: { in: matchingIds.map((r) => r.id) } },
    ] } : {};
    const [total, rows] = await Promise.all([prisma.bible.count({ where }), prisma.bible.findMany({ where, orderBy: { [p.sort === 'uuid' ? 'id' : p.sort]: p.direction }, skip: p.skip, take: p.perPage })]);
    res.json({ bibles: rows.map(bibleJson), meta: meta(p, total) });
  });
  router.patch('/system/settings/ai-defaults', async (req, res) => {
    requirePermission(res, 'bibles');
    const updates: unknown[] = Array.isArray(req.body?.defaults) ? req.body.defaults : [];
    await prisma.$transaction(async (tx) => {
      await tx.bible.updateMany({ data: { aiDefaultEnglish: false, aiDefaultHebrewOt: false, aiDefaultGreek: false, aiDefaultAramaic: false } });
      for (const raw of updates) {
        if (!raw || typeof raw !== 'object') continue;
        const row = raw as Record<string, unknown>;
        const id = string(row.uuid);
        if (!id || !await tx.bible.findUnique({ where: { id } })) continue;
        await tx.bible.update({ where: { id }, data: { aiDefaultEnglish: truthy(row.aiDefaultEnglish), aiDefaultHebrewOt: truthy(row.aiDefaultHebrewOt), aiDefaultGreek: truthy(row.aiDefaultGreek), aiDefaultAramaic: truthy(row.aiDefaultAramaic), updatedAt: new Date() } });
      }
    });
    res.json({ bibles: (await prisma.bible.findMany({ orderBy: { name: 'asc' } })).map(bibleJson) });
  });
  return router;
}

function roleInput(input: Record<string, unknown>): Partial<RoleRecord> {
  const data: Partial<RoleRecord> = {};
  if ('name' in input) data.name = string(input.name);
  for (const field of ['isDefault', 'administrator', 'bibles', 'access', 'curation'] as const) if (field in input) data[field] = truthy(input[field]);
  return data;
}
async function requestedRoleIds(input: unknown): Promise<string[]> {
  const ids = Array.isArray(input) ? [...new Set(input.map(string).filter(Boolean))] : [];
  const roles = await prisma.role.findMany({ where: { id: { in: ids } } });
  validation(roles.length === ids.length ? [] : ['One or more roles do not exist.']);
  return ids;
}
async function userInput(input: Record<string, unknown>, creating: boolean, userId?: string) {
  const data: { username?: string; email?: string; name?: string; encryptedPassword?: string } = {};
  const errors: string[] = [];
  if (creating) {
    data.username = string(input.username).trim().toLowerCase();
    if (!data.username) errors.push("Username can't be blank.");
    else if (await prisma.user.findFirst({ where: { username: { equals: data.username, mode: 'insensitive' } } })) errors.push('Username has already been taken.');
  }
  if (creating || 'name' in input) { data.name = string(input.name); if (!present(data.name)) errors.push("Name can't be blank."); }
  if (creating || 'email' in input) {
    data.email = string(input.email).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+$/.test(data.email)) errors.push('Email is invalid.');
    else if (await prisma.user.findFirst({ where: { email: { equals: data.email, mode: 'insensitive' }, ...(userId ? { id: { not: userId } } : {}) } })) errors.push('Email has already been taken.');
  }
  if (creating || present(input.password)) {
    const password = string(input.password);
    if (password.length < 6 || password.length > 128) errors.push('Password must be between 6 and 128 characters.');
    if ('passwordConfirmation' in input && password !== input.passwordConfirmation) errors.push("Password confirmation doesn't match Password.");
    if (!errors.length) data.encryptedPassword = await bcrypt.hash(password, 12);
  }
  validation(errors);
  return data;
}
