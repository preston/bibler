import { Router } from 'express';
import { prisma } from '../db/prisma.ts';
import { permissions, requireUser } from '../auth/access.ts';
import { ApiError, body, notFound, param, present, string, validation } from '../http.ts';
import { resource } from '../services/serializers.ts';

export function createDocumentsRouter() {
  const router = Router();
  router.get('/documents', async (req, res) => {
    const user = requireUser(res);
    const q = string(req.query.q).trim();
    const documents = await prisma.document.findMany({ where: { userId: user.id, ...(q ? { OR: [{ originalFilename: { contains: q, mode: 'insensitive' as const } }, { extractedText: { contains: q, mode: 'insensitive' as const } }] } : {}) }, orderBy: { updatedAt: 'desc' }, take: 500 });
    res.json({ documents: documents.map((d) => ({ ...resource(d, ['originalFilename']), extractedTextPreview: d.extractedText.length > 500 ? `${d.extractedText.slice(0, 497)}...` : d.extractedText, paths: { self: `/api/documents/${d.id}` } })) });
  });
  router.post('/documents', async (req, res) => {
    const user = requireUser(res);
    const data = documentInput(body(req, 'document'), true);
    const now = new Date();
    const document = await prisma.document.create({ data: { originalFilename: string(data.originalFilename), extractedText: string(data.extractedText), userId: user.id, createdAt: now, updatedAt: now } });
    res.status(201).json({ document: { ...resource(document, ['originalFilename', 'extractedText']), paths: { self: `/api/documents/${document.id}` } } });
  });
  router.patch('/documents/:uuid', async (req, res) => {
    const user = requireUser(res);
    const document = await prisma.document.findUnique({ where: { id: param(req, 'uuid') } }) ?? notFound('Document');
    if (document.userId !== user.id && !permissions(res).administrator) throw new ApiError(403, 'Access denied.');
    const updated = await prisma.document.update({ where: { id: document.id }, data: { ...documentInput(body(req, 'document'), false), updatedAt: new Date() } });
    res.json({ document: { ...resource(updated, ['originalFilename', 'extractedText']), paths: { self: `/api/documents/${document.id}` } } });
  });
  router.delete('/documents/:uuid', async (req, res) => {
    const user = requireUser(res);
    const document = await prisma.document.findUnique({ where: { id: param(req, 'uuid') } }) ?? notFound('Document');
    if (document.userId !== user.id && !permissions(res).administrator) throw new ApiError(403, 'Access denied.');
    await prisma.document.delete({ where: { id: document.id } });
    res.status(204).end();
  });
  return router;
}
function documentInput(input: Record<string, unknown>, creating: boolean) {
  const data: { originalFilename?: string; extractedText?: string } = {};
  const errors: string[] = [];
  for (const key of ['originalFilename', 'extractedText'] as const) if (creating || key in input) {
    data[key] = string(input[key]);
    if (!present(data[key])) errors.push(`${key} can't be blank.`);
  }
  validation(errors);
  return data;
}
