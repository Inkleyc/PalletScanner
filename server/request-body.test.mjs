import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import test from "node:test";

import { readRequestBody } from "./request-body.mjs";

test("reads a request body within the byte limit", async () => {
  const request = new PassThrough();
  request.headers = {};
  const body = readRequestBody(request, { maxBytes: 10 });
  request.end("hello");
  assert.equal(await body, "hello");
});

test("rejects a declared body larger than the byte limit", async () => {
  const request = new PassThrough();
  request.headers = { "content-length": "11" };
  await assert.rejects(
    readRequestBody(request, { maxBytes: 10 }),
    (error) => error.statusCode === 413,
  );
});

test("counts streamed UTF-8 bytes rather than JavaScript characters", async () => {
  const request = new PassThrough();
  request.headers = {};
  const body = readRequestBody(request, { maxBytes: 5 });
  request.end("€€");
  await assert.rejects(body, (error) => error.statusCode === 413);
});
