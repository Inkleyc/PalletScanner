import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import { authenticateRequest } from "./auth.mjs";

const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
const sign = (payload, secret) => {
  const header = encode({ alg: "HS256", typ: "JWT" });
  const body = encode(payload);
  const signature = createHmac("sha256", secret).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${signature}`;
};

test("local auth mode supports offline development without a bearer token", () => {
  process.env.PALLETSCANNER_AUTH_MODE = "local";
  assert.equal(authenticateRequest({ headers: {} }).userId, "local");
});

test("jwt auth mode rejects an unauthenticated request", () => {
  process.env.PALLETSCANNER_AUTH_MODE = "jwt";
  process.env.PALLETSCANNER_JWT_SECRET = "test-only-secret";
  assert.throws(
    () => authenticateRequest({ headers: {} }),
    (error) => error.statusCode === 401 && /Authentication required/.test(error.message),
  );
});

test("jwt auth mode classifies malformed token JSON as unauthorized", () => {
  process.env.PALLETSCANNER_AUTH_MODE = "jwt";
  process.env.PALLETSCANNER_JWT_SECRET = "test-only-secret";
  assert.throws(
    () => authenticateRequest({ headers: { authorization: "Bearer not-json.payload.signature" } }),
    (error) => error.statusCode === 401 && error.message === "Invalid authentication token.",
  );
});

test("jwt auth mode accepts a valid signed user subject", () => {
  const secret = "test-only-secret";
  process.env.PALLETSCANNER_AUTH_MODE = "jwt";
  process.env.PALLETSCANNER_JWT_SECRET = secret;
  const token = sign({ sub: "seller-123", exp: Math.floor(Date.now() / 1000) + 60 }, secret);
  const result = authenticateRequest({ headers: { authorization: `Bearer ${token}` } });
  assert.equal(result.userId, "seller-123");
});

test("jwt auth mode rejects an expired token", () => {
  const secret = "test-only-secret";
  process.env.PALLETSCANNER_AUTH_MODE = "jwt";
  process.env.PALLETSCANNER_JWT_SECRET = secret;
  const token = sign({ sub: "seller-123", exp: Math.floor(Date.now() / 1000) - 1 }, secret);
  assert.throws(
    () => authenticateRequest({ headers: { authorization: `Bearer ${token}` } }),
    /expired/,
  );
});
