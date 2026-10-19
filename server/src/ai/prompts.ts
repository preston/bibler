import { integerEnv, object } from './client.ts';
import { policy } from './policy.ts';
export { policy };
export function normalizeContext(value: unknown, comparator = false): unknown {
  const prefix = comparator ? 'BIBLER_SERVER_OLLAMA_COMPARATOR_' : 'BIBLER_SERVER_OLLAMA_';
  const arrayMax = Math.max(0, integerEnv(`${prefix}MAX_ARRAY_ITEMS`, comparator ? 256 : 25));
  const stringMax = Math.max(0, integerEnv(`${prefix}MAX_STRING_CHARS`, comparator ? 16384 : 600));
  function normalize(item: unknown): unknown {
    if (Array.isArray(item)) return [...item.slice(0, arrayMax).map(normalize), ...(item.length > arrayMax ? [{ _truncated_items: item.length - arrayMax }] : [])];
    if (typeof item === 'string') return item.length > stringMax ? `${item.slice(0, stringMax)}... [truncated]` : item;
    if (item && typeof item === 'object') return Object.fromEntries(Object.entries(item).map(([key, nested]) => [key, normalize(nested)]));
    return item;
  }
  return normalize(value);
}
export function contextJson(context: unknown, comparator = false): string {
  const text = JSON.stringify(normalizeContext(context, comparator), null, 2);
  const max = Math.max(0, integerEnv(comparator ? 'BIBLER_SERVER_OLLAMA_COMPARATOR_MAX_CONTEXT_CHARS' : 'BIBLER_SERVER_OLLAMA_MAX_CONTEXT_CHARS', comparator ? 524288 : 128000));
  return text.length > max ? `${text.slice(0, max)}\n... [truncated]` : text;
}
export const composePrompt = (prompt: string, context: unknown) => `${policy.core}\n\nUSER REQUEST:\n${prompt || 'Provide a biblically grounded response from the supplied context.'}\n\nSTUDY CONTEXT JSON:\n${contextJson(context)}`;
export const comparatorPrompt = (context: unknown) => `PART A — PATTERN (structure only; your answer for the real passage must match this shape)\nExample CONTEXT:\n${JSON.stringify(policy.comparatorExampleContext, null, 2)}\nExample valid response:\n${JSON.stringify(policy.comparatorExampleOutput, null, 2)}\n\nPART B — REAL PASSAGE (answer for this only)\nProduce one JSON object, with one verses entry per primary_verses ordinal.\nCONTEXT JSON:\n${contextJson(context, true)}`;
export const searchPrompt = (message: string, snapshot: unknown, references: unknown) => `ROUND 1 — SEARCH PLAN (JSON ONLY)\nOutput {"searches":[{"bible_uuid":"...","text":"search phrase","limit":10}]} only. At most 20 searches. Each limit <=25. Every bible_uuid MUST be in REFERENCE_BIBLES. Use SHORT lexical phrases (1–4 words); use 8–18 distinct searches for broad themes. Do not use long questions. Search using the language of each Bible.\nUSER_MESSAGE:\n${message}\nSTUDY_SNAPSHOT:\n${JSON.stringify(snapshot, null, 2)}\nBIBLES_CATALOG (AI-flagged translations only):\n${JSON.stringify(references, null, 2)}\nREFERENCE_BIBLES:\n${JSON.stringify(references, null, 2)}`;
export function suggestionsPrompt(message: string, snapshot: unknown, references: unknown, searchResult: unknown, target?: number): string {
  const result = object(searchResult);
  const verses = Array.isArray(result.verses) ? result.verses.slice(0, 80) : [];
  return `ROUND 2 — SUGGESTIONS (JSON ONLY)\nOutput {"suggestions":[{"id":"stable-id","type":"add_verse","title":"short title","summary":"why this helps","payload":{}}]}. At most 16 suggestions. Types: add_verse, add_commentary, add_question, add_task, add_worship.\n${target ? `TARGET_DURATION_MINUTES: ${target}. Every suggestion MUST include integer duration >=0 and the sum MUST equal ${target} exactly.` : 'Optional integer duration >=0 per suggestion.'}\nFor add_verse REQUIRED verse_uuid MUST match DATABASE_RESULTS or STUDY_SNAPSHOT; optional note. Coordinates are derived server-side; do not paste scripture text into payload. For add_commentary: source_type (manual|ai), title, body, optional prompt. For add_question: prompt, question_type (discussion|observation|interpretation|application), optional guidance_notes. For add_task: instruction, task_type (discussion|reading|prayer|memorization|reflection|create), optional assignee_label. For add_worship: optional resource_url, worship_format (song|video|other), note. Never invent citations or verse text. Order suggestions by priority. Summary becomes plan step notes: one sentence to two short paragraphs.\n${/\b(sermon|sermons|homily|preach|preaching)\b/i.test(message) ? 'SERMON LONG-FORM MODE: ignore normal brevity limits; write manuscript-style paragraphs about 130-170 words per paragraph; do not use normal short-note limits.' : 'For non-sermon requests: aim for about one sentence up to two short paragraphs.'}\n${verses.length < 8 ? 'Database results are sparse. Still return useful questions/tasks/commentary scoped honestly to what the available scripture supports.' : ''}\nORIGINAL_USER_MESSAGE_AND_INSTRUCTIONS:\n${message}\nSTUDY_SNAPSHOT:\n${JSON.stringify(snapshot, null, 2)}\nBIBLES_CATALOG / REFERENCE_BIBLES:\n${JSON.stringify(references, null, 2)}\nDATABASE_RESULTS:\n${JSON.stringify({ verses, errors: result.errors }, null, 2)}`;
}
