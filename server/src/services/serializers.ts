import type { Response } from 'express';
import type { SessionRole } from 'bibler-core';
import { prisma } from '../db/prisma.ts';
import { collaboration, type StudyAccess, type SermonAccess, type RoleRecord } from '../auth/access.ts';

export function pick(row: object, fields: readonly string[]): Record<string, unknown> {
  const record = row as Record<string, unknown>;
  return Object.fromEntries(fields.map((key) => [key, record[key]]));
}
export function resource(row: object & { id: string }, fields: readonly string[]): Record<string, unknown> & { uuid: string } {
  return { uuid: row.id, ...pick(row, fields), ...pick(row, ['createdAt', 'updatedAt']) };
}
export function roleJson(role: RoleRecord): SessionRole {
  return { id: role.id, name: role.name, administrator: role.administrator, bibles: role.bibles, access: role.access, curation: role.curation, default: role.isDefault };
}
export const userJson = (user: object) => pick(user, ['id', 'username', 'email', 'name', 'createdAt', 'updatedAt']);
export const bibleJson = (bible: object & { id: string }) => ({ id: bible.id, ...resource(bible, ['name', 'abbreviation', 'language', 'license', 'aiDefaultEnglish', 'aiDefaultHebrewOt', 'aiDefaultGreek', 'aiDefaultAramaic']) });

export async function bookJson(book: object & { id: string; bibleId: string }) {
  const bible = await prisma.bible.findUnique({ where: { id: book.bibleId } });
  return { id: book.id, ...resource(book, ['name', 'ordinal', 'testament']), bible: bible ? { ...pick(bible, ['id', 'name', 'abbreviation']), uuid: bible.id, path: `/api/bibles/${bible.id}` } : null };
}
export async function defaultBibles() {
  const roles = [
    ['english', 'aiDefaultEnglish', ['en']], ['hebrewOt', 'aiDefaultHebrewOt', ['hbo', 'he']],
    ['greek', 'aiDefaultGreek', ['grc', 'el']], ['aramaic', 'aiDefaultAramaic', ['arc', 'syr']],
  ] as const;
  return Object.fromEntries(await Promise.all(roles.map(async ([name, flag, codes]) => {
    const bible = await prisma.bible.findFirst({ where: { [flag]: true } }) ?? await prisma.bible.findFirst({ where: { language: { in: [...codes] } }, orderBy: { id: 'asc' } });
    return [name, bible ? { uuid: bible.id, ...pick(bible, ['abbreviation', 'name', 'language']) } : null];
  })));
}

export async function studyJson(study: StudyAccess & object, res: Response, detailed = false) {
  const owner = study.ownerId ? await prisma.user.findUnique({ where: { id: study.ownerId } }) : null;
  const durations = await prisma.studyPlanItem.aggregate({ where: { studyId: study.id, duration: { gt: 0 } }, _sum: { duration: true } });
  const result: Record<string, unknown> = {
    ...resource(study, ['title', 'goal', 'visibility']), totalDurationMinutes: durations._sum.duration ?? 0,
    ...await collaboration(res, study), aiDefaultReferenceBibles: await (res.locals.aiReferenceBibles ??= defaultBibles()),
    paths: { self: `/api/studies/${study.id}`, verses: `/api/studies/${study.id}/verses`, commentaries: `/api/studies/${study.id}/commentaries`, questions: `/api/studies/${study.id}/questions`, tasks: `/api/studies/${study.id}/tasks`, planItems: `/api/studies/${study.id}/plan-items` },
  };
  if (owner) result.owner = pick(owner, ['id', 'username', 'name']);
  if (detailed) {
    const [verses, commentaries, questions, tasks, answers] = await Promise.all([
      prisma.studyVerse.count({ where: { studyId: study.id } }), prisma.studyCommentary.count({ where: { studyId: study.id } }),
      prisma.studyQuestion.count({ where: { studyId: study.id } }), prisma.studyTask.count({ where: { studyId: study.id } }), prisma.studyAnswer.count({ where: { studyId: study.id } }),
    ]);
    result.counts = { verses, commentaries, questions, tasks, answers };
  }
  return result;
}

export async function sermonJson(sermon: SermonAccess & object) {
  const owner = await prisma.user.findUnique({ where: { id: sermon.userId } });
  return { ...resource(sermon, ['title', 'visibility', 'targetDurationMinutes']), ...(owner ? { owner: pick(owner, ['id', 'username', 'name']) } : {}), paths: { self: `/api/sermons/${sermon.id}`, sections: `/api/sermons/${sermon.id}/sections` } };
}

export interface ResourceRecord { id: string; studyId?: string; [key: string]: unknown }
export async function verseReferenceJson(row: ResourceRecord, fields: string[], paths: Record<string, string>) {
  const verse = typeof row.verseUuid === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(row.verseUuid) ? await prisma.verse.findUnique({ where: { id: row.verseUuid } }) : null;
  return { ...resource(row, fields), verseText: verse?.text || row.verseText, paths };
}

export async function answerJson(answer: object & { id: string; userId: string | null; studyCommentaryId: string | null }) {
  const user = answer.userId ? await prisma.user.findUnique({ where: { id: answer.userId } }) : null;
  return { ...resource(answer, ['response', 'authorLabel', 'visibility']), studyCommentaryUuid: answer.studyCommentaryId, userId: answer.userId, username: user?.username ?? null };
}
