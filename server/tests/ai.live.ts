import assert from 'node:assert/strict';
import { test } from 'node:test';
import { OllamaClient } from '../src/ai/client.ts';
import { policy } from '../src/ai/prompts.ts';
test('configured Ollama produces a complete non-streaming and streaming response', { skip: !process.env.BIBLER_SERVER_OLLAMA_URL }, async () => {
  const chat = new OllamaClient();
  for (const stream of [false, true]) {
    const result = await chat.run({ model: process.env.BIBLER_SERVER_OLLAMA_TEST_MODEL, system: policy.core, user: 'Do not quote scripture. Reply with one short sentence explaining that scripture must come from supplied database context.', stream, options: { num_predict: 2048 } });
    assert.equal(result.error, undefined, JSON.stringify(result));
    assert.ok(typeof result.output === 'string' && result.output.trim().length > 0);
  }
});
