import type { RequestHandler, Response } from 'express';
import { prisma } from '../db/prisma.ts';
import { ApiError } from '../http.ts';

export type UserRecord = NonNullable<Awaited<ReturnType<typeof prisma.user.findUnique>>>;
export interface Permissions { administrator: boolean; bibles: boolean; access: boolean; curation: boolean }
export interface RoleRecord { id: string; name: string; isDefault: boolean; administrator: boolean; bibles: boolean; access: boolean; curation: boolean }
export interface StudyAccess { id: string; ownerId: string | null; visibility: string }
export interface SermonAccess { id: string; userId: string; visibility: string }

export function permissionsFor(roles: readonly RoleRecord[]): Permissions {
  const administrator = roles.some((r) => r.administrator);
  return { administrator, bibles: administrator || roles.some((r) => r.bibles), access: administrator || roles.some((r) => r.access), curation: administrator || roles.some((r) => r.curation) };
}

export async function rolesFor(userId: string): Promise<RoleRecord[]> {
  const joins = await prisma.rolesUser.findMany({ where: { userId } });
  return prisma.role.findMany({ where: { id: { in: joins.map((r) => r.roleId) } }, orderBy: { name: 'asc' } });
}

export const authenticate: RequestHandler = async (req, res, next) => {
  const authorization = req.header('authorization') ?? '';
  const token = authorization.replace(/^Bearer\s+/i, '').trim();
  const user = token ? await prisma.user.findUnique({ where: { apiToken: token } }) : null;
  const roles = user ? await rolesFor(user.id) : [];
  res.locals.user = user;
  res.locals.roles = roles.map((r) => r.name);
  res.locals.roleRecords = roles;
  res.locals.permissions = permissionsFor(roles);
  next();
};

export const currentUser = (res: Response): UserRecord | null => res.locals.user as UserRecord | null ?? null;
export const permissions = (res: Response): Permissions => res.locals.permissions as Permissions ?? permissionsFor([]);
export function requireUser(res: Response): UserRecord {
  const user = currentUser(res);
  if (!user) throw new ApiError(401, 'Authentication required.');
  return user;
}
export function requirePermission(res: Response, flag: keyof Permissions): void {
  if (!permissions(res)[flag]) throw new ApiError(403, 'Access denied.');
}
export async function isCoLeader(userId: string | undefined, studyId: string): Promise<boolean> {
  return !!userId && !!await prisma.studyAssignment.findFirst({ where: { userId, studyId } });
}
export async function authorizeStudy(res: Response, study: StudyAccess, action: 'read' | 'edit' | 'delete' | 'transfer' = 'read'): Promise<void> {
  const user = currentUser(res);
  const perms = permissions(res);
  if (perms.administrator) return;
  if (action === 'read' && study.visibility !== 'private') return;
  if (user && (study.ownerId === user.id || perms.curation)) return;
  if (user && (action === 'read' || action === 'edit') && await isCoLeader(user.id, study.id)) return;
  throw new ApiError(403, 'Access denied.');
}
export function authorizeSermon(res: Response, sermon: SermonAccess, action: 'read' | 'edit' = 'read'): void {
  if (permissions(res).administrator) return;
  if (action === 'read' && sermon.visibility !== 'private') return;
  const user = currentUser(res);
  if (user && (sermon.userId === user.id || permissions(res).curation)) return;
  throw new ApiError(403, 'Access denied.');
}

export async function collaboration(res: Response, study: StudyAccess) {
  const user = currentUser(res);
  const perms = permissions(res);
  const coLeader = await isCoLeader(user?.id, study.id);
  const leader = !!user && (perms.administrator || perms.curation || study.ownerId === user.id);
  const mode = leader ? 'leader' : coLeader ? 'co-leader' : 'participant';
  const canEdit = leader || coLeader;
  return {
    availableStudyModes: !user ? ['participant'] : perms.administrator ? ['leader', 'co-leader', 'participant'] : leader ? ['leader', 'participant'] : coLeader ? ['co-leader', 'participant'] : ['participant'],
    myStudyRole: user && perms.curation && study.ownerId !== user.id && !coLeader ? 'curator' : study.ownerId === user?.id ? 'owner' : coLeader ? 'co_leader' : 'participant',
    capabilities: { mode, canEditStructure: canEdit, canManageTasks: canEdit, canReorderContent: canEdit, canDeleteContent: canEdit, canAnswerQuestions: true, canDeleteStudy: leader },
  };
}
