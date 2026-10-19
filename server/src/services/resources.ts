import { prisma } from '../db/prisma.ts';
import { present, select, string, validation } from '../http.ts';
import type { ResourceRecord } from './serializers.ts';

// Only validated scalar fields reach these delegates. A shared adapter keeps the
// identical nested-resource lifecycle in one place without coupling to relation names.
export interface ResourceDelegate {
  findMany(args: object): Promise<ResourceRecord[]>;
  findFirst(args: object): Promise<ResourceRecord | null>;
  create(args: object): Promise<ResourceRecord>;
  update(args: object): Promise<ResourceRecord>;
  delete(args: object): Promise<ResourceRecord>;
  aggregate(args: object): Promise<{ _max: { position: number | null } }>;
}
export type ResourceKind = 'verse' | 'commentary' | 'question' | 'task' | 'planItem' | 'section' | 'sectionVerse';
export interface ResourceConfig {
  kind: ResourceKind;
  delegate: ResourceDelegate;
  wrapper: string;
  collection: string;
  envelope: string;
  label: string;
  fields: readonly string[];
  required: readonly string[];
  defaults: Record<string, unknown>;
  enums?: Record<string, readonly string[]>;
}
export const resourceConfigs: ResourceConfig[] = [
  { kind: 'verse', delegate: prisma.studyVerse as unknown as ResourceDelegate, wrapper: 'studyVerse', collection: 'verses', envelope: 'verse', label: 'Study verse', fields: ['verseUuid', 'bibleUuid', 'bookUuid', 'chapter', 'ordinal', 'verseText', 'note', 'position'], required: ['bibleUuid', 'bookUuid'], defaults: {} },
  { kind: 'commentary', delegate: prisma.studyCommentary as unknown as ResourceDelegate, wrapper: 'studyCommentary', collection: 'commentaries', envelope: 'commentary', label: 'Study commentary', fields: ['sourceType', 'title', 'body', 'prompt', 'position', 'context'], required: ['sourceType', 'title'], defaults: { sourceType: 'manual', context: {} }, enums: { sourceType: ['manual', 'ai'] } },
  { kind: 'question', delegate: prisma.studyQuestion as unknown as ResourceDelegate, wrapper: 'studyQuestion', collection: 'questions', envelope: 'question', label: 'Study question', fields: ['prompt', 'questionType', 'guidanceNotes', 'position', 'verseAnchor'], required: ['prompt', 'questionType'], defaults: { questionType: 'discussion', verseAnchor: {} }, enums: { questionType: ['discussion', 'observation', 'interpretation', 'application'] } },
  { kind: 'task', delegate: prisma.studyTask as unknown as ResourceDelegate, wrapper: 'studyTask', collection: 'tasks', envelope: 'task', label: 'Study task', fields: ['instruction', 'taskType', 'status', 'assigneeLabel', 'dueAt', 'position', 'context'], required: ['instruction', 'taskType', 'status'], defaults: { taskType: 'discussion', status: 'open', context: {} }, enums: { taskType: ['discussion', 'reading', 'prayer', 'memorization', 'reflection', 'create'], status: ['open', 'in_progress', 'completed', 'archived'] } },
  { kind: 'planItem', delegate: prisma.studyPlanItem as unknown as ResourceDelegate, wrapper: 'studyPlanItem', collection: 'plan-items', envelope: 'planItem', label: 'Study plan item', fields: ['title', 'itemType', 'notes', 'position', 'duration', 'anchor', 'resourceType', 'resourceUuid'], required: ['title', 'itemType'], defaults: {}, enums: { itemType: ['verse', 'commentary', 'question', 'task', 'custom', 'worship'] } },
];
export const sectionConfig: ResourceConfig = { kind: 'section', delegate: prisma.sermonSection as unknown as ResourceDelegate, wrapper: 'sermonSection', collection: 'sections', envelope: 'sermonSection', label: 'Sermon section', fields: ['title', 'body', 'position', 'estimatedMinutes'], required: [], defaults: { title: '' } };
export const sectionVerseConfig: ResourceConfig = { kind: 'sectionVerse', delegate: prisma.sermonSectionVerse as unknown as ResourceDelegate, wrapper: 'sermonSectionVerse', collection: 'verses', envelope: 'sermonSectionVerse', label: 'Sermon section verse', fields: ['verseUuid', 'bibleUuid', 'bookUuid', 'chapter', 'ordinal', 'verseText', 'position'], required: ['bibleUuid', 'bookUuid'], defaults: {} };
const durations: Record<string, number> = { verse: 2, question: 7, commentary: 5, task: 5, custom: 5, worship: 5 };
const resources: Record<string, string> = { verse: 'study_verse', commentary: 'study_commentary', question: 'study_question', task: 'study_task' };

export async function validateResource(config: ResourceConfig, input: Record<string, unknown>, previous?: ResourceRecord): Promise<Record<string, unknown>> {
  const values = { ...config.defaults, ...previous, ...select(input, config.fields) };
  const data = select(values, config.fields);
  const errors: string[] = [];
  if (config.kind === 'verse' || config.kind === 'sectionVerse') {
    if (present(data.verseUuid)) {
      const verse = await prisma.verse.findUnique({ where: { id: string(data.verseUuid).trim() } });
      if (!verse) errors.push('Verse UUID does not match a known verse.');
      else Object.assign(data, { verseUuid: verse.id, bibleUuid: verse.bibleId, bookUuid: verse.bookId, chapter: verse.chapter, ordinal: verse.ordinal, verseText: null });
    }
    for (const key of ['chapter', 'ordinal']) {
      data[key] = Number(data[key]);
      if (!Number.isInteger(data[key]) || Number(data[key]) <= 0) errors.push(`${key} must be a positive integer.`);
    }
  }
  for (const key of config.required) if (!present(data[key])) errors.push(`${key} can't be blank.`);
  for (const [key, choices] of Object.entries(config.enums ?? {})) if (!choices.includes(string(data[key]))) errors.push(`${key} is not included in the list.`);
  if (data.position !== undefined) {
    data.position = Number(data.position);
    // Plan positions historically allow any integer; all other ordered resources require nonnegative positions.
    if (!Number.isInteger(data.position) || (config.kind !== 'planItem' && Number(data.position) < 0)) errors.push('Position must be a nonnegative integer.');
  }
  if (config.kind === 'planItem') {
    if (!previous && data.duration == null) data.duration = durations[string(data.itemType)];
    if (data.duration != null) {
      data.duration = Number(data.duration);
      if (!Number.isInteger(data.duration) || Number(data.duration) < 0) errors.push('Duration must be a nonnegative integer.');
    }
    if (data.resourceType != null && !Object.values(resources).includes(string(data.resourceType))) errors.push('Resource type is not included in the list.');
    if (present(data.resourceType) || present(data.resourceUuid)) {
      const expected = resources[string(data.itemType)];
      if (!expected) errors.push('Resource type must be empty for this item type.');
      else if (data.resourceType !== expected) errors.push(`Resource type must be ${expected} for this item type.`);
      if (!present(data.resourceUuid)) errors.push('Resource UUID must be present when resource type is set.');
    }
  }
  if (data.dueAt != null) {
    data.dueAt = data.dueAt instanceof Date ? new Date(data.dueAt) : new Date(string(data.dueAt));
    if (Number.isNaN((data.dueAt as Date).getTime())) errors.push('Due at is invalid.');
  }
  if (data.estimatedMinutes != null) {
    data.estimatedMinutes = Number(data.estimatedMinutes);
    if (!Number.isInteger(data.estimatedMinutes)) errors.push('Estimated minutes must be an integer.');
  }
  for (const key of ['context', 'verseAnchor']) if (key in data && (!data[key] || typeof data[key] !== 'object' || Array.isArray(data[key]))) errors.push(`${key} must be an object.`);
  for (const key of config.fields) {
    if (['position', 'chapter', 'ordinal', 'duration', 'estimatedMinutes', 'context', 'verseAnchor', 'dueAt'].includes(key)) continue;
    if (data[key] != null && typeof data[key] !== 'string') errors.push(`${key} must be text.`);
  }
  validation(errors);
  return data;
}

export async function nextPosition(delegate: ResourceDelegate, where: object) {
  const result = await delegate.aggregate({ where, _max: { position: true } });
  return (result._max.position ?? -1) + 1;
}

export async function deleteStudy(id: string) {
  await prisma.$transaction(async (tx) => {
    const items = await tx.studyPlanItem.findMany({ where: { studyId: id }, select: { id: true } });
    const questions = await tx.studyQuestion.findMany({ where: { studyId: id }, select: { id: true } });
    const commentaries = await tx.studyCommentary.findMany({ where: { studyId: id }, select: { id: true } });
    await tx.studyPlanItemUserState.deleteMany({ where: { studyPlanItemId: { in: items.map((i) => i.id) } } });
    await tx.studyAnswer.deleteMany({ where: { OR: [{ studyId: id }, { studyQuestionId: { in: questions.map((q) => q.id) } }] } });
    await tx.studyAnswer.updateMany({ where: { studyCommentaryId: { in: commentaries.map((c) => c.id) } }, data: { studyCommentaryId: null } });
    await tx.studyAssignment.deleteMany({ where: { studyId: id } });
    await tx.studyVerse.deleteMany({ where: { studyId: id } });
    await tx.studyCommentary.deleteMany({ where: { studyId: id } });
    await tx.studyQuestion.deleteMany({ where: { studyId: id } });
    await tx.studyTask.deleteMany({ where: { studyId: id } });
    await tx.studyPlanItem.deleteMany({ where: { studyId: id } });
    await tx.study.delete({ where: { id } });
  });
}
export async function deleteNested(config: ResourceConfig, id: string) {
  await prisma.$transaction(async (tx) => {
    switch (config.kind) {
      case 'verse': await tx.studyVerse.delete({ where: { id } }); break;
      case 'commentary': await tx.studyAnswer.updateMany({ where: { studyCommentaryId: id }, data: { studyCommentaryId: null } }); await tx.studyCommentary.delete({ where: { id } }); break;
      case 'question': await tx.studyAnswer.deleteMany({ where: { studyQuestionId: id } }); await tx.studyQuestion.delete({ where: { id } }); break;
      case 'task': await tx.studyTask.delete({ where: { id } }); break;
      case 'planItem': await tx.studyPlanItemUserState.deleteMany({ where: { studyPlanItemId: id } }); await tx.studyPlanItem.delete({ where: { id } }); break;
      case 'section': await tx.sermonSectionVerse.deleteMany({ where: { sermonSectionId: id } }); await tx.sermonSection.delete({ where: { id } }); break;
      case 'sectionVerse': await tx.sermonSectionVerse.delete({ where: { id } }); break;
    }
  });
}
export async function deleteSermon(id: string) {
  await prisma.$transaction(async (tx) => {
    const sections = await tx.sermonSection.findMany({ where: { sermonId: id }, select: { id: true } });
    await tx.sermonSectionVerse.deleteMany({ where: { sermonSectionId: { in: sections.map((s) => s.id) } } });
    await tx.sermonSection.deleteMany({ where: { sermonId: id } });
    await tx.sermon.delete({ where: { id } });
  });
}
