import { Router, type Request, type Response } from 'express';
import { prisma } from '../db/prisma.ts';
import { authorizeStudy, authorizeSermon } from '../auth/access.ts';
import { type Chat, type ChatResult, OllamaClient, camelize, integerEnv, object, parseResponseJson } from './client.ts';
import { composePrompt, comparatorPrompt, policy } from './prompts.ts';
import { studyAssistant, studyVerseRows } from './study.ts';
import { validUuid } from '../mcp/tools.ts';
import { sermonOutlinePass, sermonVersePass } from './sermon.ts';
const positive = (value: unknown) => { const n = Math.trunc(Number(value)); return n > 0 ? n : undefined; };
const send = (res: Response, result: unknown) => { if (!res.destroyed && !res.writableEnded) res.status(object(result).error ? 422 : 200).json(camelize(result)); };
function lifecycle(res: Response) {
  const controller = new AbortController();
  res.once('close', () => { if (!res.writableEnded) controller.abort(new Error('Client disconnected.')); });
  if (res.destroyed) controller.abort(new Error('Client disconnected.'));
  return controller;
}
export function createAiRouter(dependencies: { chat?: Chat; db?: typeof prisma } = {}) {
  const router = Router(), db = dependencies.db ?? prisma, chat = dependencies.chat ?? new OllamaClient();
  router.get('/ai/health', (_req, res) => {
    const configured = Boolean(process.env.BIBLER_SERVER_OLLAMA_URL?.trim());
    res.json({ status: configured ? 'ok' : 'unconfigured', ollamaConfigured: configured, baseUrl: process.env.BIBLER_SERVER_OLLAMA_URL ?? null });
  });
  router.post('/ai/chat', async (req, res) => {
    const body = object(req.body);
    send(res, await chat.run({ system: policy.core, user: composePrompt(String(body.prompt ?? ''), object(body.context)), model: typeof body.model === 'string' ? body.model : undefined, signal: lifecycle(res).signal }));
  });
  router.post('/ai/comparator-commentary', async (req, res) => {
    const root = object(req.body), body = root.comparatorCommentary ? object(root.comparatorCommentary) : root;
    if (!validUuid(body.primaryBibleUuid) || !validUuid(body.secondaryBibleUuid)) { res.status(422).json({ error: 'Unknown primary or secondary Bible.' }); return; }
    const [primary, secondary] = await Promise.all([db.bible.findFirst({ where: { id: String(body.primaryBibleUuid ?? '') } }), db.bible.findFirst({ where: { id: String(body.secondaryBibleUuid ?? '') } })]);
    if (!primary || !secondary) { res.status(422).json({ error: 'Unknown primary or secondary Bible.' }); return; }
    const chapter = positive(body.chapter);
    if (!chapter) { res.status(422).json({ error: 'Chapter must be a positive integer.' }); return; }
    if (!validUuid(body.primaryBookUuid) || !validUuid(body.secondaryBookUuid)) { res.status(422).json({ error: 'Unknown primary or secondary book for the selected Bible.' }); return; }
    const [primaryBook, secondaryBook] = await Promise.all([db.book.findFirst({ where: { id: String(body.primaryBookUuid ?? ''), bibleId: primary.id } }), db.book.findFirst({ where: { id: String(body.secondaryBookUuid ?? ''), bibleId: secondary.id } })]);
    if (!primaryBook || !secondaryBook) { res.status(422).json({ error: 'Unknown primary or secondary book for the selected Bible.' }); return; }
    const [primaryRows, secondaryRows] = await Promise.all([db.verse.findMany({ where: { bibleId: primary.id, bookId: primaryBook.id, chapter }, orderBy: { ordinal: 'asc' }, select: { ordinal: true, text: true } }), db.verse.findMany({ where: { bibleId: secondary.id, bookId: secondaryBook.id, chapter }, orderBy: { ordinal: 'asc' }, select: { ordinal: true, text: true } })]);
    if (!primaryRows.length || !secondaryRows.length) { res.status(422).json({ error: 'No verses found for this chapter in one or both translations.' }); return; }
    if (primaryRows.length !== secondaryRows.length || primaryRows.some((verse, i) => verse.ordinal !== secondaryRows[i]?.ordinal)) { res.status(422).json({ error: 'Verse alignment is required: verse counts or ordinals do not match between translations.' }); return; }
    const bibleMetadata = (bible: typeof primary) => ({ uuid: bible.id, name: bible.name, abbreviation: bible.abbreviation, language: bible.language });
    const context = { chapter, primary_bible: bibleMetadata(primary), secondary_bible: bibleMetadata(secondary), primary_book: { uuid: primaryBook.id, name: primaryBook.name }, secondary_book: { uuid: secondaryBook.id, name: secondaryBook.name }, primary_verses: primaryRows, secondary_verses: secondaryRows };
    const result = await chat.run({ system: policy.comparator, user: comparatorPrompt(context), model: typeof root.model === 'string' ? root.model : undefined, ...(process.env.BIBLER_SERVER_OLLAMA_COMPARATOR_JSON_FORMAT === 'true' ? { format: policy.comparatorFormat } : {}), options: { temperature: 0.15, num_predict: integerEnv('BIBLER_SERVER_OLLAMA_COMPARATOR_NUM_PREDICT', 16384) }, signal: lifecycle(res).signal });
    if (!result.error) {
      const parsed = parseResponseJson(result.output);
      result.structuredOutput = parsed !== null;
      if (parsed !== null) { result.output = parsed; if (result.raw?.message) result.raw.message = { ...object(result.raw.message), content: parsed }; }
    }
    send(res, result);
  });
  router.post('/studies/:uuid/ai/:action', async (req, res, next) => {
    const action = String(req.params.action);
    if (!['generate-commentary', 'summarize', 'generate-questions', 'assistant'].includes(action)) { next(); return; }
    if (!validUuid(req.params.uuid)) { res.status(404).json({ error: 'Study not found.' }); return; }
    const study = await db.study.findFirst({ where: { id: String(req.params.uuid) } });
    if (!study) { res.status(404).json({ error: 'Study not found.' }); return; }
    await authorizeStudy(res, study, 'read');
    const body = object(req.body), controller = lifecycle(res);
    if (action === 'assistant') {
      const streaming = /^(1|true|yes)$/i.test(String(body.stream ?? '')) || Boolean(req.get('Accept')?.includes('text/event-stream'));
      const options = { db, chat, signal: controller.signal, target: positive(body.targetDurationMinutes), stream: streaming };
      if (!streaming) { send(res, await studyAssistant(study, String(body.message ?? ''), options)); return; }
      res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
      res.flushHeaders();
      let errorWritten = false;
      const emit = (event: string, data: unknown) => {
        if (controller.signal.aborted || res.destroyed || res.writableEnded) return;
        if (event === 'error') errorWritten = true;
        res.write(`event: ${event}\ndata: ${JSON.stringify(camelize(data))}\n\n`);
      };
      const timer = setTimeout(() => {
        emit('error', { error: 'Assistant stream timed out.', hint: 'Set BIBLER_ASSISTANT_SSE_MAX_SECONDS (seconds) on the server if runs need longer.' });
        controller.abort(new Error('Assistant stream timed out.'));
        res.end();
      }, Math.max(1, integerEnv('BIBLER_ASSISTANT_SSE_MAX_SECONDS', 600) * 1000));
      timer.unref();
      try {
        const result = await studyAssistant(study, String(body.message ?? ''), { ...options, emit });
        if (object(result).error && !errorWritten) emit('error', result);
      } catch (error) { if (!controller.signal.aborted) emit('error', { error: error instanceof Error ? error.message : String(error) }); }
      finally { clearTimeout(timer); if (!res.writableEnded) res.end(); }
      return;
    }
    const studyInfo = { uuid: study.id, title: study.title, goal: study.goal };
    let context: unknown, prompt: string, system: string = policy.core;
    if (action === 'generate-commentary') {
      context = { study: studyInfo, verses: await studyVerseRows(study.id, 30, db), user_instruction: String(body.instruction ?? '') };
      prompt = String(body.prompt ?? ''); system = policy.commentary;
    } else if (action === 'generate-questions') {
      context = { study: studyInfo, verses: (await studyVerseRows(study.id, 40, db)).map(({ note: _note, ...row }) => row) };
      prompt = String(body.prompt || 'Generate discussion questions anchored in scripture references from the provided study verses.');
    } else {
      const [commentaries, questions] = await Promise.all([db.studyCommentary.findMany({ where: { studyId: study.id }, orderBy: [{ position: 'asc' }, { id: 'asc' }], take: 20 }), db.studyQuestion.findMany({ where: { studyId: study.id }, orderBy: [{ position: 'asc' }, { id: 'asc' }], take: 20 })]);
      context = { study: studyInfo, commentaries: commentaries.map(c => ({ title: c.title, body: c.body, source_type: c.sourceType })), questions: questions.map(q => ({ prompt: q.prompt, question_type: q.questionType })) };
      prompt = String(body.prompt || 'Provide a concise biblical summary of this study session.');
    }
    send(res, await chat.run({ system, user: composePrompt(prompt, context), signal: controller.signal }));
  });
  router.post('/sermons/:uuid/ai/:action', async (req, res, next) => {
    const action = String(req.params.action);
    if (action !== 'verse-pass' && action !== 'outline-pass') { next(); return; }
    if (!validUuid(req.params.uuid)) { res.status(404).json({ error: 'Sermon not found.' }); return; }
    const sermon = await db.sermon.findFirst({ where: { id: String(req.params.uuid) } });
    if (!sermon) { res.status(404).json({ error: 'Sermon not found.' }); return; }
    authorizeSermon(res, sermon, 'edit');
    const body = object(req.body), signal = lifecycle(res).signal;
    const options = { db, chat, signal, documents: Array.isArray(body.documentUuids) ? body.documentUuids.map(String).filter(validUuid) : [], target: positive(body.targetDurationMinutes), replaceSections: body.replaceSections === undefined || ![false, 'false', '0', 0].some(value => value === body.replaceSections) };
    send(res, await (action === 'verse-pass' ? sermonVersePass : sermonOutlinePass)(sermon, String(body.message ?? ''), options));
  });
  return router;
}
