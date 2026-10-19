import { Router, type Request, type Response } from 'express';
import { prisma } from '../db/prisma.ts';
import { authorizeSermon, currentUser, requireUser } from '../auth/access.ts';
import { body, meta, notFound, pagination, param, present, string, validation } from '../http.ts';
import { resource, sermonJson, verseReferenceJson, type ResourceRecord } from '../services/serializers.ts';
import { deleteNested, deleteSermon, nextPosition, sectionConfig, sectionVerseConfig, validateResource } from '../services/resources.ts';

async function loadSermon(req: Request, res: Response, action: 'read' | 'edit' = 'read') {
  const sermon = await prisma.sermon.findUnique({ where: { id: param(req, 'sermon') } }) ?? notFound('Sermon');
  authorizeSermon(res, sermon, action);
  return sermon;
}
export function createSermonsRouter() {
  const router = Router();
  router.get('/sermons', async (req, res) => {
    const p = pagination(req, ['title', 'visibility', 'createdAt', 'updatedAt'], 'updatedAt');
    const owned = req.query.scope === 'owned';
    const user = owned ? requireUser(res) : currentUser(res);
    const where = { ...(owned && user ? { userId: user.id } : { visibility: 'public' }), ...(p.q ? { title: { contains: p.q, mode: 'insensitive' as const } } : {}) };
    const [total, rows] = await Promise.all([prisma.sermon.count({ where }), prisma.sermon.findMany({ where, orderBy: { [p.sort]: p.direction }, skip: p.skip, take: p.perPage })]);
    res.json({ sermons: await Promise.all(rows.map(sermonJson)), meta: meta(p, total) });
  });
  router.post('/sermons', async (req, res) => {
    const user = requireUser(res);
    const input = sermonInput(body(req, 'sermon'), true);
    const now = new Date();
    const sermon = await prisma.sermon.create({ data: { title: string(input.title), visibility: string(input.visibility), targetDurationMinutes: input.targetDurationMinutes, userId: user.id, createdAt: now, updatedAt: now } });
    res.status(201).json({ sermon: await sermonJson(sermon) });
  });
  router.get('/sermons/:sermon', async (req, res) => res.json({ sermon: await sermonJson(await loadSermon(req, res)) }));
  router.patch('/sermons/:sermon', async (req, res) => {
    const sermon = await loadSermon(req, res, 'edit');
    const updated = await prisma.sermon.update({ where: { id: sermon.id }, data: { ...sermonInput(body(req, 'sermon'), false), updatedAt: new Date() } });
    res.json({ sermon: await sermonJson(updated) });
  });
  router.delete('/sermons/:sermon', async (req, res) => { await deleteSermon((await loadSermon(req, res, 'edit')).id); res.status(204).end(); });

  const sections = '/sermons/:sermon/sections';
  const sectionJson = (row: ResourceRecord, sermonId: string) => ({ ...resource(row, sectionConfig.fields), paths: { self: `/api/sermons/${sermonId}/sections/${row.id}`, verses: `/api/sermons/${sermonId}/sections/${row.id}/verses` } });
  const verseJson = (row: ResourceRecord, sermonId: string, sectionId: string) => verseReferenceJson(row, sectionVerseConfig.fields.filter((f) => f !== 'verseText'), { self: `/api/sermons/${sermonId}/sections/${sectionId}/verses/${row.id}` });
  router.get(sections, async (req, res) => {
    const sermon = await loadSermon(req, res);
    const rows = await sectionConfig.delegate.findMany({ where: { sermonId: sermon.id }, orderBy: [{ position: 'asc' }, { id: 'asc' }] });
    res.json({ sermonSections: await Promise.all(rows.map(async (row) => {
      const verses = await sectionVerseConfig.delegate.findMany({ where: { sermonSectionId: row.id }, orderBy: [{ position: 'asc' }, { id: 'asc' }] });
      return { ...sectionJson(row, sermon.id), sermonSectionVerses: await Promise.all(verses.map((v) => verseJson(v, sermon.id, row.id))) };
    })) });
  });
  router.post(sections, async (req, res) => {
    const sermon = await loadSermon(req, res, 'edit');
    const data = await validateResource(sectionConfig, body(req, sectionConfig.wrapper));
    if (data.position == null) data.position = await nextPosition(sectionConfig.delegate, { sermonId: sermon.id });
    const now = new Date();
    const row = await sectionConfig.delegate.create({ data: { ...data, sermonId: sermon.id, createdAt: now, updatedAt: now } });
    res.status(201).json({ sermonSection: sectionJson(row, sermon.id) });
  });
  router.patch(`${sections}/:section`, async (req, res) => {
    const sermon = await loadSermon(req, res, 'edit');
    const row = await sectionConfig.delegate.findFirst({ where: { id: param(req, 'section'), sermonId: sermon.id } }) ?? notFound('Sermon section');
    const data = await validateResource(sectionConfig, body(req, sectionConfig.wrapper), row);
    const updated = await sectionConfig.delegate.update({ where: { id: row.id }, data: { ...data, updatedAt: new Date() } });
    res.json({ sermonSection: sectionJson(updated, sermon.id) });
  });
  router.delete(`${sections}/:section`, async (req, res) => {
    const sermon = await loadSermon(req, res, 'edit');
    const row = await sectionConfig.delegate.findFirst({ where: { id: param(req, 'section'), sermonId: sermon.id } }) ?? notFound('Sermon section');
    await deleteNested(sectionConfig, row.id);
    res.status(204).end();
  });
  const verses = `${sections}/:section/verses`;
  async function verseContext(req: Request, res: Response, edit = false) {
    const sermon = await loadSermon(req, res, edit ? 'edit' : 'read');
    const section = await prisma.sermonSection.findFirst({ where: { id: param(req, 'section'), sermonId: sermon.id } }) ?? notFound('Sermon section');
    return { sermon, section };
  }
  router.get(verses, async (req, res) => {
    const { sermon, section } = await verseContext(req, res);
    const rows = await sectionVerseConfig.delegate.findMany({ where: { sermonSectionId: section.id }, orderBy: [{ position: 'asc' }, { id: 'asc' }] });
    res.json({ sermonSectionVerses: await Promise.all(rows.map((r) => verseJson(r, sermon.id, section.id))) });
  });
  router.post(verses, async (req, res) => {
    const { sermon, section } = await verseContext(req, res, true);
    const data = await validateResource(sectionVerseConfig, body(req, sectionVerseConfig.wrapper));
    if (data.position == null) data.position = await nextPosition(sectionVerseConfig.delegate, { sermonSectionId: section.id });
    const now = new Date();
    const row = await sectionVerseConfig.delegate.create({ data: { ...data, sermonSectionId: section.id, createdAt: now, updatedAt: now } });
    res.status(201).json({ sermonSectionVerse: await verseJson(row, sermon.id, section.id) });
  });
  router.patch(`${verses}/:uuid`, async (req, res) => {
    const { sermon, section } = await verseContext(req, res, true);
    const row = await sectionVerseConfig.delegate.findFirst({ where: { id: param(req, 'uuid'), sermonSectionId: section.id } }) ?? notFound('Sermon section verse');
    const data = await validateResource(sectionVerseConfig, body(req, sectionVerseConfig.wrapper), row);
    const updated = await sectionVerseConfig.delegate.update({ where: { id: row.id }, data: { ...data, updatedAt: new Date() } });
    res.json({ sermonSectionVerse: await verseJson(updated, sermon.id, section.id) });
  });
  router.delete(`${verses}/:uuid`, async (req, res) => {
    const { section } = await verseContext(req, res, true);
    const row = await sectionVerseConfig.delegate.findFirst({ where: { id: param(req, 'uuid'), sermonSectionId: section.id } }) ?? notFound('Sermon section verse');
    await deleteNested(sectionVerseConfig, row.id);
    res.status(204).end();
  });
  return router;
}
function sermonInput(input: Record<string, unknown>, creating: boolean) {
  const data: { title?: string; visibility?: string; targetDurationMinutes?: number | null } = {};
  const errors: string[] = [];
  if (creating || 'title' in input) { data.title = string(input.title); if (!present(data.title)) errors.push("Title can't be blank."); }
  if (creating || 'visibility' in input) { data.visibility = 'visibility' in input ? string(input.visibility) : 'private'; if (!['private', 'sharable', 'public'].includes(data.visibility)) errors.push('Visibility is not included in the list.'); }
  if ('targetDurationMinutes' in input) {
    data.targetDurationMinutes = input.targetDurationMinutes == null ? null : Number(input.targetDurationMinutes);
    if (data.targetDurationMinutes != null && !Number.isInteger(data.targetDurationMinutes)) errors.push('Target duration must be an integer.');
  }
  validation(errors);
  return data;
}
