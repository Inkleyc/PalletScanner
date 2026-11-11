import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const scriptPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "production-check.mjs",
);

// Fake, clearly non-secret values: this script only checks presence/shape,
// never calls eBay or any network service.
const completeProductionEnv = {
  EBAY_ENVIRONMENT: "production",
  EBAY_CLIENT_ID: "test-client-id",
  EBAY_CLIENT_SECRET: "test-client-secret",
  EBAY_RUNAME: "test-runame",
  EBAY_MERCHANT_LOCATION_KEY: "test-location",
  EBAY_PAYMENT_POLICY_ID: "test-payment-policy",
  EBAY_RETURN_POLICY_ID: "test-return-policy",
  EBAY_FULFILLMENT_POLICY_ID: "test-fulfillment-policy",
  PALLETSCANNER_JWT_SECRET: "test-jwt-secret",
  EBAY_TOKEN_ENCRYPTION_KEY: "test-encryption-key",
  PALLETSCANNER_ALLOWED_ORIGIN: "https://app.example.com",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_ANON_KEY: "test-anon-key",
  PALLETSCANNER_AUTH_MODE: "jwt",
  PALLETSCANNER_IDENTITY_PROVIDER: "supabase",
};

const runCheck = async (env) => {
  // Empty temp cwd: production-check loads ./.env when present, and no
  // .env may leak real values into these assertions.
  const cwd = await mkdtemp(path.join(os.tmpdir(), "palletflip-prodcheck-"));
  try {
    const { stdout } = await execFileAsync(process.execPath, [scriptPath], {
      cwd,
      env: { PATH: process.env.PATH, ...env },
      timeout: 10_000,
    });
    return { stdout, code: 0 };
  } catch (error) {
    return { stdout: error.stdout ?? "", code: error.code };
  }
};

test("production check passes without an AI key while AI is deferred", async () => {
  const { stdout, code } = await runCheck({ ...completeProductionEnv });
  assert.equal(code, 0);
  assert.match(stdout, /Required production gates: PASS/);
});

test("production check passes without an AI key when AI is explicitly disabled", async () => {
  const { stdout, code } = await runCheck({
    ...completeProductionEnv,
    PALLETSCANNER_AI_ENABLED: "false",
  });
  assert.equal(code, 0);
  assert.match(stdout, /Required production gates: PASS/);
});

test("production check requires an AI key when AI is explicitly enabled", async () => {
  const { stdout, code } = await runCheck({
    ...completeProductionEnv,
    PALLETSCANNER_AI_ENABLED: "true",
  });
  assert.equal(code, 1);
  assert.match(stdout, /ANTHROPIC_API_KEY is required/);
});

test("production check passes with an AI key when AI is explicitly enabled", async () => {
  const { stdout, code } = await runCheck({
    ...completeProductionEnv,
    PALLETSCANNER_AI_ENABLED: "true",
    ANTHROPIC_API_KEY: "test-anthropic-key",
  });
  assert.equal(code, 0);
  assert.match(stdout, /Required production gates: PASS/);
});

test("production check fails in sandbox mode and with the environment unset", async () => {
  const sandbox = await runCheck({
    ...completeProductionEnv,
    EBAY_ENVIRONMENT: "sandbox",
  });
  assert.equal(sandbox.code, 1);
  assert.match(sandbox.stdout, /EBAY_ENVIRONMENT must be production/);

  const { EBAY_ENVIRONMENT: _dropped, ...unset } = completeProductionEnv;
  const missing = await runCheck(unset);
  assert.equal(missing.code, 1);
  assert.match(missing.stdout, /EBAY_ENVIRONMENT must be production/);
});

test("production check rejects a wildcard origin and a client-visible AI key", async () => {
  const wildcard = await runCheck({
    ...completeProductionEnv,
    PALLETSCANNER_ALLOWED_ORIGIN: "*",
  });
  assert.equal(wildcard.code, 1);
  assert.match(wildcard.stdout, /must be a specific app origin/);

  const exposed = await runCheck({
    ...completeProductionEnv,
    EXPO_PUBLIC_ANTHROPIC_API_KEY: "test-exposed-key",
  });
  assert.equal(exposed.code, 1);
  assert.match(exposed.stdout, /must be removed/);
});

test("production check still fails when a required non-AI value is missing", async () => {
  const { PALLETSCANNER_JWT_SECRET: _dropped, ...env } =
    completeProductionEnv;
  const { stdout, code } = await runCheck(env);
  assert.equal(code, 1);
  assert.match(stdout, /PALLETSCANNER_JWT_SECRET is required/);
});
