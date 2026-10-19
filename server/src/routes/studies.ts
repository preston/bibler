import { Router, type Request, type Response } from 'express';
import { prisma } from '../db/prisma.ts';
import { authorizeStudy, collaboration, currentUser, requireUser } from '../auth/access.ts';
import { ApiError, body, meta, notFound, pagination, param, present, select, string, validation } from '../http.ts';
import { answerJson, resource, studyJson, verseReferenceJson, type ResourceRecord } from '../services/serializers.ts';
import { deleteNested, deleteStudy, nextPosition, resourceConfigs, validateResource, type ResourceConfig } from '../services/resources.ts';

export async function loadStudy(req: Request, res: Response, action: 'read' | 'edit' | 'delete' | 'transfer' = 'read') {
  const study = await prisma.study.findUnique({ where: { id: param(req, 'study') } }) ?? notFound('Study');
  await authorizeStudy(res, study, action);
  return study;
}
export function createStudiesRouter() {
  const router = Router();
  router.get('/studies', async (req, res) => {
    const p = pagination(req, ['title', 'visibility', 'createdAt', 'updatedAt'], 'updatedAt');
    const owned = req.query.scope === 'owned';
    const user = owned ? requireUser(res) : currentUser(res);
    const assignments = owned && user ? await prisma.studyAssignment.findMany({ where: { userId: user.id } }) : [];
    const where = {
      ...(owned && user ? { OR: [{ ownerId: user.id }, { id: { in: assignments.map((a) => a.studyId) } }] } : { visibility: 'public' }),
      ...(p.q ? { AND: [{ OR: [{ title: { contains: p.q, mode: 'insensitive' as const } }, { goal: { contains: p.q, mode: 'insensitive' as const } }] }] } : {}),
    };
    const [total, rows] = await Promise.all([prisma.study.count({ where }), prisma.study.findMany({ where, orderBy: { [p.sort]: p.direction }, skip: p.skip, take: p.perPage })]);
    res.json({ studies: await Promise.all(rows.map((r) => studyJson(r, res))), meta: meta(p, total) });
  });
  router.post('/studies', async (req, res) => {
    const user = requireUser(res);
    const input = studyInput(body(req, 'study'), true);
    const now = new Date();
    const study = await prisma.study.create({ data: { title: string(input.title), visibility: string(input.visibility), goal: input.goal as string | null | undefined, ownerId: user.id, createdAt: now, updatedAt: now } });
    res.status(201).json({ study: await studyJson(study, res, true) });
  });
  router.get('/studies/:study', async (req, res) => res.json({ study: await studyJson(await loadStudy(req, res), res, true) }));
  router.patch('/studies/:study', async (req, res) => {
    const study = await loadStudy(req, res, 'edit');
    const input = studyInput(body(req, 'study'), false);
    const updated = await prisma.study.update({ where: { id: study.id }, data: { ...input, updatedAt: new Date() } });
    res.json({ study: await studyJson(updated, res, true) });
  });
  router.delete('/studies/:study', async (req, res) => { await deleteStudy((await loadStudy(req, res, 'delete')).id); res.status(204).end(); });
  router.post('/studies/:study/transfer-owner', async (req, res) => {
    const study = await loadStudy(req, res, 'transfer');
    const userId = string(req.body?.userId || req.body?.transfer?.userId);
    const target = userId ? await prisma.user.findUnique({ where: { id: userId } }) : null;
    if (!target) throw new ApiError(422, 'User not found.');
    const assignment = await prisma.studyAssignment.findFirst({ where: { studyId: study.id, userId: target.id } });
    if (!assignment) throw new ApiError(422, 'Target must be an existing co-leader.');
    if (study.ownerId === target.id) throw new ApiError(422, 'That user is already the owner.');
    const now = new Date();
    const updated = await prisma.$transaction(async (tx) => {
      await tx.studyAssignment.delete({ where: { id: assignment.id } });
      const updated = await tx.study.update({ where: { id: study.id }, data: { ownerId: target.id, updatedAt: now } });
      if (study.ownerId && !await tx.studyAssignment.findFirst({ where: { studyId: study.id, userId: study.ownerId } })) await tx.studyAssignment.create({ data: { studyId: study.id, userId: study.ownerId, createdAt: now, updatedAt: now } });
      return updated;
    });
    res.json({ study: await studyJson(updated, res, true) });
  });
  router.get('/studies/:study/assignments', async (req, res) => {
    const study = await loadStudy(req, res, 'edit');
    const assignments = await prisma.studyAssignment.findMany({ where: { studyId: study.id } });
    const users = await prisma.user.findMany({ where: { id: { in: assignments.map((a) => a.userId) } } });
    res.json({ assignments: users.map((u) => ({ userId: u.id, username: u.username, name: u.name, email: u.email })) });
  });
  router.post('/studies/:study/assignments', async (req, res) => {
    const study = await loadStudy(req, res, 'edit');
    const login = string(req.body?.username).trim() || string(req.body?.email).trim();
    if (!login) throw new ApiError(422, 'username or email is required.');
    const user = await prisma.user.findFirst({ where: { username: { equals: login, mode: 'insensitive' } } }) ?? await prisma.user.findFirst({ where: { email: { equals: login, mode: 'insensitive' } } });
    if (!user) throw new ApiError(422, 'No user matches that username or email.');
    if (user.id === study.ownerId) throw new ApiError(422, 'The study owner is already a leader; add a different user.');
    const now = new Date();
    await prisma.studyAssignment.create({ data: { studyId: study.id, userId: user.id, createdAt: now, updatedAt: now } });
    res.status(201).json({ assignment: { userId: user.id, username: user.username, name: user.name, email: user.email } });
  });
  router.delete('/studies/:study/assignments/:userId', async (req, res) => {
    const study = await loadStudy(req, res, 'edit');
    const assignment = await prisma.studyAssignment.findFirst({ where: { studyId: study.id, userId: param(req, 'userId') } }) ?? notFound('Assignment');
    await prisma.studyAssignment.delete({ where: { id: assignment.id } });
    res.status(204).end();
  });
  router.get(['/studies/:study/role', '/studies/:study/modes'], async (req, res) => {
    const study = await loadStudy(req, res);
    res.json({ studyUuid: study.id, capabilities: (await collaboration(res, study)).capabilities });
  });
  router.patch(['/studies/:study/role', '/studies/:study/modes/mode'], async (req, res) => {
    const study = await loadStudy(req, res, 'edit');
    res.json({ studyUuid: study.id, capabilities: (await collaboration(res, study)).capabilities });
  });

  for (const config of resourceConfigs) mountResource(router, config);
  mountAnswers(router);
  return router;
}

function studyInput(input: Record<string, unknown>, creating: boolean) {
  const data: { title?: string; goal?: string | null; visibility?: string } = {};
  const errors: string[] = [];
  if (creating || 'title' in input) { data.title = string(input.title); if (!present(data.title)) errors.push("Title can't be blank."); }
  if ('goal' in input) data.goal = input.goal === null ? null : string(input.goal);
  if (creating || 'visibility' in input) { data.visibility = 'visibility' in input ? string(input.visibility) : 'private'; if (!['private', 'sharable', 'public'].includes(data.visibility)) errors.push('Visibility is not included in the list.'); }
  validation(errors);
  return data;
}

async function nestedJson(config: ResourceConfig, row: ResourceRecord, res: Response) {
  const path = `/api/studies/${row.studyId}/${config.collection}/${row.id}`;
  if (config.kind === 'verse') return verseReferenceJson(row, [...config.fields].filter((f) => f !== 'verseText'), { study: `/api/studies/${row.studyId}` });
  const json = resource(row, config.fields);
  if (config.kind === 'planItem') {
    json.duration = Number(row.duration) > 0 ? row.duration : null;
    const user = currentUser(res);
    if (user) {
      const state = await prisma.studyPlanItemUserState.findFirst({ where: { userId: user.id, studyPlanItemId: row.id } });
      json.myStatus = state?.status ?? 'todo';
    }
  } else json.paths = { self: path, ...(config.kind === 'commentary' ? { study: `/api/studies/${row.studyId}` } : {}), ...(config.kind === 'question' ? { answers: `${path}/answers` } : {}) };
  return json;
}
function mountResource(router: Router, config: ResourceConfig) {
  const path = `/studies/:study/${config.collection}`;
  const envelope = config.kind === 'planItem' ? 'planItems' : config.collection;
  const list = async (studyId: string, res: Response) => {
    const rows = await config.delegate.findMany({ where: { studyId }, orderBy: [{ position: 'asc' }, { [config.kind === 'planItem' ? 'createdAt' : 'id']: 'asc' }] });
    return { [envelope]: await Promise.all(rows.map((r) => nestedJson(config, r, res))) };
  };
  router.get(path, async (req, res) => res.json(await list((await loadStudy(req, res)).id, res)));
  if (config.kind !== 'verse' && config.kind !== 'planItem') router.get(`${path}/:uuid`, async (req, res) => {
    const study = await loadStudy(req, res);
    const row = await config.delegate.findFirst({ where: { id: param(req, 'uuid'), studyId: study.id } }) ?? notFound(config.label);
    res.json({ [config.envelope]: await nestedJson(config, row, res) });
  });
  router.post(path, async (req, res) => {
    const study = await loadStudy(req, res, 'edit');
    const data = await validateResource(config, body(req, config.wrapper));
    if (data.position == null) data.position = await nextPosition(config.delegate, { studyId: study.id });
    const now = new Date();
    const row = await config.delegate.create({ data: { ...data, studyId: study.id, createdAt: now, updatedAt: now } });
    res.status(201).json({ [config.envelope]: await nestedJson(config, row, res) });
  });
  router.patch(`${path}/:uuid`, async (req, res) => {
    const study = await loadStudy(req, res, 'edit');
    const row = await config.delegate.findFirst({ where: { id: param(req, 'uuid'), studyId: study.id } }) ?? notFound(config.label);
    const data = await validateResource(config, body(req, config.wrapper), row);
    const updated = await config.delegate.update({ where: { id: row.id }, data: { ...data, updatedAt: new Date() } });
    res.json({ [config.envelope]: await nestedJson(config, updated, res) });
  });
  router.delete(`${path}/:uuid`, async (req, res) => {
    const study = await loadStudy(req, res, 'edit');
    const row = await config.delegate.findFirst({ where: { id: param(req, 'uuid'), studyId: study.id } }) ?? notFound(config.label);
    await deleteNested(config, row.id);
    res.status(204).end();
  });
  if (['question', 'task', 'planItem'].includes(config.kind)) router.post(`${path}/reorder`, async (req, res) => {
    const study = await loadStudy(req, res, 'edit');
    const ids = Array.isArray(req.body?.orderedUuids) ? req.body.orderedUuids.map(string) : [];
    if (config.kind === 'planItem' && !ids.length) throw new ApiError(422, 'No plan item UUIDs supplied.');
    // Update only resources belonging to this study. The transaction avoids exposing partially reordered content.
    await prisma.$transaction(async (tx) => {
      for (const [position, id] of ids.entries()) {
        const args = { where: { id, studyId: study.id }, data: { position, updatedAt: new Date() } };
        if (config.kind === 'question') await tx.studyQuestion.updateMany(args);
        else if (config.kind === 'task') await tx.studyTask.updateMany(args);
        else await tx.studyPlanItem.updateMany(args);
      }
    });
    res.json(await list(study.id, res));
  });
  if (config.kind === 'planItem') router.patch(`${path}/:uuid/state`, async (req, res) => {
    const study = await loadStudy(req, res);
    const user = requireUser(res);
    const row = await config.delegate.findFirst({ where: { id: param(req, 'uuid'), studyId: study.id } }) ?? notFound(config.label);
    const status = string(req.body?.status);
    if (!status) throw new ApiError(422, 'status is required.');
    if (!['todo', 'revisit', 'complete'].includes(status)) throw new ApiError(422, 'Invalid status.');
    const now = new Date();
    await prisma.studyPlanItemUserState.upsert({ where: { userId_studyPlanItemId: { userId: user.id, studyPlanItemId: row.id } }, create: { userId: user.id, studyPlanItemId: row.id, status, createdAt: now, updatedAt: now }, update: { status, updatedAt: now } });
    res.json({ planItem: await nestedJson(config, row, res) });
  });
}

function mountAnswers(router: Router) {
  const path = '/studies/:study/questions/:question/answers';
  async function context(req: Request, res: Response) {
    const study = await loadStudy(req, res);
    const question = await prisma.studyQuestion.findFirst({ where: { id: param(req, 'question'), studyId: study.id } }) ?? notFound('Study question');
    return { study, question };
  }
  router.get(path, async (req, res) => {
    const { question } = await context(req, res);
    const answers = await prisma.studyAnswer.findMany({ where: { studyQuestionId: question.id }, orderBy: { createdAt: 'asc' } });
    res.json({ answers: await Promise.all(answers.map(answerJson)) });
  });
  router.post(path, async (req, res) => {
    const { study, question } = await context(req, res);
    const user = requireUser(res);
    const data = await answerInput(body(req, 'studyAnswer'), study.id, { visibility: 'study', authorLabel: user.username, userId: user.id });
    const now = new Date();
    const answer = await prisma.studyAnswer.create({ data: { response: string(data.response), visibility: string(data.visibility), authorLabel: data.authorLabel as string | null, studyCommentaryId: data.studyCommentaryId as string | null | undefined, studyId: study.id, studyQuestionId: question.id, userId: user.id, createdAt: now, updatedAt: now } });
    res.status(201).json({ answer: await answerJson(answer) });
  });
  router.patch(`${path}/:uuid`, async (req, res) => {
    const { study, question } = await context(req, res);
    const answer = await prisma.studyAnswer.findFirst({ where: { id: param(req, 'uuid'), studyQuestionId: question.id } }) ?? notFound('Study answer');
    if (answer.userId !== currentUser(res)?.id) await authorizeStudy(res, study, 'edit');
    const data = await answerInput(body(req, 'studyAnswer'), study.id, answer);
    const updated = await prisma.studyAnswer.update({ where: { id: answer.id }, data: { response: string(data.response), visibility: string(data.visibility), authorLabel: data.authorLabel as string | null, studyCommentaryId: data.studyCommentaryId as string | null | undefined, updatedAt: new Date() } });
    res.json({ answer: await answerJson(updated) });
  });
  router.delete(`${path}/:uuid`, async (req, res) => {
    const { study, question } = await context(req, res);
    const answer = await prisma.studyAnswer.findFirst({ where: { id: param(req, 'uuid'), studyQuestionId: question.id } }) ?? notFound('Study answer');
    if (answer.userId !== currentUser(res)?.id) await authorizeStudy(res, study, 'edit');
    await prisma.studyAnswer.delete({ where: { id: answer.id } });
    res.status(204).end();
  });
}
async function answerInput(input: Record<string, unknown>, studyId: string, previous: object) {
  const data = { ...previous, ...select(input, ['response', 'authorLabel', 'visibility', 'studyCommentaryId']) } as Record<string, unknown>;
  const errors: string[] = [];
  if (!present(data.response)) errors.push("Response can't be blank.");
  if (!['study', 'leaders', 'private'].includes(string(data.visibility))) errors.push('Visibility is not included in the list.');
  if (present(data.studyCommentaryId) && !await prisma.studyCommentary.findFirst({ where: { id: string(data.studyCommentaryId), studyId } })) errors.push('Study commentary must belong to this study.');
  if (!present(data.authorLabel) && typeof data.userId === 'string') {
    data.authorLabel = (await prisma.user.findUnique({ where: { id: data.userId } }))?.username ?? null;
  }
  if (data.authorLabel != null && typeof data.authorLabel !== 'string') errors.push('Author label must be text.');
  validation(errors);
  return data;
}
