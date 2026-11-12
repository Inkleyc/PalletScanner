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

test("local auth mode supports offline development without a bearer token", async () => {
  process.env.PALLETSCANNER_AUTH_MODE = "local";
  assert.equal((await authenticateRequest({ headers: {} })).userId, "local");
});

test("jwt auth mode rejects an unauthenticated request", async () => {
  process.env.PALLETSCANNER_AUTH_MODE = "jwt";
  process.env.PALLETSCANNER_JWT_SECRET = "test-only-secret";
  await assert.rejects(
    () => authenticateRequest({ headers: {} }),
    (error) => error.statusCode === 401 && /Authentication required/.test(error.message),
  );
});

test("jwt auth mode classifies malformed token JSON as unauthorized", async () => {
  process.env.PALLETSCANNER_AUTH_MODE = "jwt";
  process.env.PALLETSCANNER_JWT_SECRET = "test-only-secret";
  await assert.rejects(
    () => authenticateRequest({ headers: { authorization: "Bearer not-json.payload.signature" } }),
    (error) => error.statusCode === 401 && error.message === "Invalid authentication token.",
  );
});

test("jwt auth mode accepts a valid signed user subject", async () => {
  const secret = "test-only-secret";
  process.env.PALLETSCANNER_AUTH_MODE = "jwt";
  process.env.PALLETSCANNER_JWT_SECRET = secret;
  const token = sign({ sub: "seller-123", exp: Math.floor(Date.now() / 1000) + 60 }, secret);
  const result = await authenticateRequest({ headers: { authorization: `Bearer ${token}` } });
  assert.equal(result.userId, "seller-123");
});

test("jwt auth mode rejects a signed token without an expiration", async () => {
  const secret = "test-only-secret";
  process.env.PALLETSCANNER_AUTH_MODE = "jwt";
  process.env.PALLETSCANNER_JWT_SECRET = secret;
  const token = sign({ sub: "seller-123" }, secret);
  await assert.rejects(
    () => authenticateRequest({ headers: { authorization: `Bearer ${token}` } }),
    (error) => error.statusCode === 401,
  );
});

test("jwt auth mode rejects an expired token", async () => {
  const secret = "test-only-secret";
  process.env.PALLETSCANNER_AUTH_MODE = "jwt";
  process.env.PALLETSCANNER_JWT_SECRET = secret;
  const token = sign({ sub: "seller-123", exp: Math.floor(Date.now() / 1000) - 1 }, secret);
  await assert.rejects(
    () => authenticateRequest({ headers: { authorization: `Bearer ${token}` } }),
    /expired/,
  );
});

// ES256 via the project's JWKS (PF-SCOPE-021): Supabase now signs session
// tokens with asymmetric keys, so the server verifies against the keys the
// project publishes instead of a shared secret.
import {
  generateKeyPairSync,
  sign as cryptoSign,
} from "node:crypto";
import { createServer } from "node:http";
import { after, before } from "node:test";

const keyPairA = generateKeyPairSync("ec", { namedCurve: "P-256" });
const keyPairB = generateKeyPairSync("ec", { namedCurve: "P-256" });
const publicJwk = (publicKey, kid) => ({
  ...publicKey.export({ format: "jwk" }),
  kid,
  alg: "ES256",
  use: "sig",
});
let servedJwks = { keys: [publicJwk(keyPairA.publicKey, "kid-a")] };
let jwksServer;
let jwksFetchCount = 0;

const signEs256 = (payload, privateKey, kid) => {
  const header = encode({ alg: "ES256", typ: "JWT", kid });
  const body = encode(payload);
  const signature = cryptoSign(
    "sha256",
    Buffer.from(`${header}.${body}`),
    { key: privateKey, dsaEncoding: "ieee-p1363" },
  ).toString("base64url");
  return `${header}.${body}.${signature}`;
};

before(async () => {
  jwksServer = createServer((req, res) => {
    if (req.url === "/auth/v1/.well-known/jwks.json") {
      jwksFetchCount += 1;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(servedJwks));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise((resolve) => jwksServer.listen(0, "127.0.0.1", resolve));
  process.env.PALLETSCANNER_AUTH_MODE = "jwt";
  delete process.env.PALLETSCANNER_JWT_SECRET;
  process.env.SUPABASE_URL = `http://127.0.0.1:${jwksServer.address().port}`;
});

after(async () => {
  await new Promise((resolve) => jwksServer.close(resolve));
  delete process.env.SUPABASE_URL;
});

test("jwt auth mode accepts a valid ES256 session token from the JWKS", async () => {
  const token = signEs256(
    { sub: "user-es256", exp: Math.floor(Date.now() / 1000) + 60 },
    keyPairA.privateKey,
    "kid-a",
  );
  const result = await authenticateRequest({
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(result.userId, "user-es256");
});

test("jwt auth mode rejects an ES256 token signed by the wrong key", async () => {
  const token = signEs256(
    { sub: "user-es256", exp: Math.floor(Date.now() / 1000) + 60 },
    keyPairB.privateKey,
    "kid-a",
  );
  await assert.rejects(
    () => authenticateRequest({ headers: { authorization: `Bearer ${token}` } }),
    (error) => error.statusCode === 401 && error.message === "Invalid authentication token.",
  );
});

test("jwt auth mode rejects an expired ES256 token", async () => {
  const token = signEs256(
    { sub: "user-es256", exp: Math.floor(Date.now() / 1000) - 5 },
    keyPairA.privateKey,
    "kid-a",
  );
  await assert.rejects(
    () => authenticateRequest({ headers: { authorization: `Bearer ${token}` } }),
    /expired/,
  );
});

test("jwt auth mode refreshes the JWKS when a rotated key id appears", async () => {
  const fetchesBefore = jwksFetchCount;
  const token = signEs256(
    { sub: "user-rotated", exp: Math.floor(Date.now() / 1000) + 60 },
    keyPairB.privateKey,
    "kid-b",
  );
  // The rotated key is not published yet: verification fails closed.
  await assert.rejects(
    () => authenticateRequest({ headers: { authorization: `Bearer ${token}` } }),
    (error) => error.statusCode === 401,
  );
  // Once the project publishes the new key, the same token verifies.
  servedJwks = {
    keys: [
      publicJwk(keyPairA.publicKey, "kid-a"),
      publicJwk(keyPairB.publicKey, "kid-b"),
    ],
  };
  const result = await authenticateRequest({
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(result.userId, "user-rotated");
  assert.ok(jwksFetchCount > fetchesBefore);
});
