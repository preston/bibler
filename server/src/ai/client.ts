export type JsonObject = Record<string, unknown>;
export type ChatResult = { model?: string; output?: unknown; raw?: JsonObject; structuredOutput?: boolean; error?: string; hint?: string; details?: unknown };
export type ChatOptions = { system: string; user: string; model?: string | null; format?: unknown; options?: Record<string, number>; signal?: AbortSignal; stream?: boolean; onDelta?: (accumulated: string) => void };
export interface Chat { run(options: ChatOptions): Promise<ChatResult> }
export const integerEnv = (name: string, fallback: number): number => {
  const value = process.env[name];
  return value !== undefined && /^-?\d+$/.test(value.trim()) ? Number(value) : fallback;
};
export const object = (value: unknown): JsonObject => value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : {};
export function parseResponseJson(text: unknown, depth = 0): unknown {
  if (typeof text !== 'string' || !text.trim() || depth > 3) return null;
  const value = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  try {
    const parsed: unknown = JSON.parse(value);
    return typeof parsed === 'string' && /^[\[{]/.test(parsed.trim()) ? parseResponseJson(parsed, depth + 1) : parsed;
  } catch {
    const start = value.indexOf('{'), end = value.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    try { return JSON.parse(value.slice(start, end + 1)) as unknown; } catch { return null; }
  }
}

/** Fetch is injected so tests exercise the actual request and NDJSON decoding without an Ollama host. */
export class OllamaClient implements Chat {
  private readonly fetcher: typeof fetch;
  constructor(fetcher: typeof fetch = fetch) { this.fetcher = fetcher; }
  async run(input: ChatOptions): Promise<ChatResult> {
    const base = process.env.BIBLER_SERVER_OLLAMA_URL?.trim();
    if (!base) return { error: 'BIBLER_SERVER_OLLAMA_URL is not configured.' };
    const streaming = input.stream ?? false;
    const timeoutName = streaming ? 'BIBLER_SERVER_OLLAMA_STREAM_READ_TIMEOUT' : 'BIBLER_SERVER_OLLAMA_READ_TIMEOUT';
    const timeout = integerEnv(timeoutName, streaming ? 600 : 180);
    const attempts = streaming ? 1 : Math.max(1, integerEnv('BIBLER_SERVER_OLLAMA_RETRIES', 1) + 1);
    for (let attempt = 0; attempt < attempts; attempt++) {
      const controller = new AbortController();
      const abort = () => controller.abort(input.signal?.reason);
      input.signal?.addEventListener('abort', abort, { once: true });
      if (input.signal?.aborted) abort();
      let timeoutReached = false;
      let timer: ReturnType<typeof setTimeout>;
      const setTimer = (seconds: number) => {
        clearTimeout(timer);
        timer = setTimeout(() => { timeoutReached = true; controller.abort(); }, Math.max(1, seconds * 1000));
        timer.unref();
      };
      setTimer(integerEnv('BIBLER_SERVER_OLLAMA_OPEN_TIMEOUT', 2) + integerEnv('BIBLER_SERVER_OLLAMA_WRITE_TIMEOUT', 30));
      try {
        const payload = {
          model: input.model || process.env.BIBLER_SERVER_OLLAMA_MODEL?.trim() || 'bigwest60/bible-scholar:latest',
          messages: [{ role: 'system', content: input.system }, { role: 'user', content: input.user }],
          stream: streaming,
          ...(input.format ? { format: input.format } : {}),
          options: { num_ctx: integerEnv('BIBLER_SERVER_OLLAMA_NUM_CTX', 131_072), ...input.options }
        };
        const response = await this.fetcher(new URL('/api/chat', base), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: controller.signal });
        setTimer(timeout);
        if (!response.ok) {
          let details: unknown;
          try { details = await response.json(); } catch { details = {}; }
          return { error: `Ollama request failed with status ${response.status}.`, details };
        }
        if (!streaming) {
          const raw = object(await response.json());
          if (raw.error) return { error: String(raw.error) };
          return { model: String(raw.model ?? payload.model), output: object(raw.message).content, raw };
        }
        if (!response.body) return { error: 'Ollama returned an empty response stream.' };
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '', accumulated = '', last: JsonObject = {};
        const consume = (line: string) => {
          if (!line.trim()) return;
          last = object(JSON.parse(line));
          if (last.error) throw new Error(String(last.error));
          const delta = String(object(last.message).content ?? '');
          accumulated += delta;
          if (delta) input.onDelta?.(accumulated);
        };
        try {
          while (true) {
            const part = await reader.read();
            if (part.done) break;
            setTimer(timeout);
            buffer += decoder.decode(part.value, { stream: true });
            let boundary: number;
            while ((boundary = buffer.indexOf('\n')) >= 0) {
              consume(buffer.slice(0, boundary));
              buffer = buffer.slice(boundary + 1);
            }
          }
          buffer += decoder.decode();
          if (buffer.trim()) consume(buffer);
        } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
        return { model: String(last.model ?? payload.model), output: accumulated, raw: { model: last.model, message: { content: accumulated }, raw_last: last } };
      } catch (error) {
        if (input.signal?.aborted) return { error: 'Assistant request cancelled.' };
        if (timeoutReached && attempt + 1 < attempts) continue;
        if (timeoutReached) return {
          error: `Ollama ${streaming ? 'stream' : 'request'} timed out after ${timeout}s (open timeout ${integerEnv('BIBLER_SERVER_OLLAMA_OPEN_TIMEOUT', 2)}s).`,
          hint: `Increase ${timeoutName} or simplify the prompt/context payload.`
        };
        return { error: `Ollama ${streaming ? 'stream' : 'request'} failed: ${error instanceof Error ? error.message : String(error)}` };
      } finally { clearTimeout(timer!); input.signal?.removeEventListener('abort', abort); }
    }
    return { error: 'Ollama request failed.' };
  }
}

export function camelize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(camelize);
  if (value && typeof value === 'object' && !(value instanceof Date)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()), camelize(item)]));
  return value;
}
