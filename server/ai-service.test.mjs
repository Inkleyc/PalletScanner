import assert from "node:assert/strict";
import test from "node:test";

import { createAiService } from "./ai-service.mjs";

test("sends bounded authenticated AI requests and caps output tokens", async () => {
  let observed;
  const service = createAiService({
    apiKey: "server-only-key",
    model: "test-model",
    timeoutMs: 1_000,
    fetchImpl: async (url, init) => {
      observed = { url, init };
      return new Response(JSON.stringify({ content: [{ type: "text", text: "{}" }] }), { status: 200 });
    },
  });
  const result = await service("seller-1", { max_tokens: 99_999, messages: [{ role: "user", content: "identify" }] });
  const body = JSON.parse(observed.init.body);
  assert.equal(observed.url, "https://api.anthropic.com/v1/messages");
  assert.equal(observed.init.headers["x-api-key"], "server-only-key");
  assert.equal(body.max_tokens, 2_000);
  assert.equal(body.model, "test-model");
  assert.ok(observed.init.signal instanceof AbortSignal);
  assert.equal(result.content[0].text, "{}");
});

test("rejects AI requests before calling the provider when messages are missing", async () => {
  let called = false;
  const service = createAiService({
    apiKey: "server-only-key",
    fetchImpl: async () => { called = true; return new Response("{}"); },
  });
  await assert.rejects(service("seller-1", {}), (error) => error.statusCode === 400);
  assert.equal(called, false);
});
